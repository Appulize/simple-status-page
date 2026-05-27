<?php
declare(strict_types=1);

namespace App\State;

use App\Config\Store;
use App\Providers\Provider;
use App\Providers\Registry;
use App\Util\Log;
use App\Util\Safe;

class Aggregator
{
    private Cache $cache;
    private Backoff $backoff;
    private Evaluator $evaluator;
    private string $lockPath;

    public function __construct(?Cache $cache = null, ?Backoff $backoff = null, ?Evaluator $evaluator = null, ?string $lockPath = null)
    {
        $this->cache     = $cache     ?? new Cache();
        $this->backoff   = $backoff   ?? new Backoff();
        $this->evaluator = $evaluator ?? new Evaluator();
        $this->lockPath  = $lockPath  ?? dirname(__DIR__, 2) . '/cache/state.json.lock';
    }

    /**
     * Build the public /api/state payload. Cache-first; falls back to stale on error.
     *
     * @return array<string, mixed>
     */
    public function get(): array
    {
        $settings = Store::read();
        $refresh  = Safe::int(Safe::get($settings, 'ui.refreshIntervalSec'), 30);
        $ttl      = Cache::ttlFor($refresh);

        // An admin save (visibility toggle, rename, reorder) updates settings.json's
        // mtime. When that mtime is newer than the cache, neither the fresh nor
        // the stale-while-revalidate branch is safe to return — the cached items
        // reflect the pre-save world. Force a synchronous regeneration instead.
        $settingsMtime = Store::mtime();
        $cachedAt      = $this->cache->cachedAt();
        $cacheCurrent  = $cachedAt === null || $settingsMtime <= $cachedAt;

        if ($cacheCurrent) {
            // 1. Fresh cache → return immediately.
            $fresh = $this->cache->get($ttl);
            if ($fresh !== null) {
                return $fresh;
            }

            // 2. Stale cache exists → stale-while-revalidate. Return stale instantly,
            //    kick off a background regen so the next request gets fresh data.
            $stale = $this->cache->getStale();
            if ($stale !== null) {
                $this->spawnBackgroundRegen();
                $stale['meta']['freshness']  = 'stale';
                $stale['meta']['staleSince'] = $this->cache->cachedAt();
                return $stale;
            }
        } else {
            // Settings changed since cache. If every currently-visible item is already
            // in the cached items, we can re-apply the user-controllable transforms
            // (visibility filter, displayOrder, displayName overrides) without paying
            // the provider fetch cost. Only when an item became newly-visible (or a
            // new instance was added) do we fall through to a full synchronous regen.
            $cachedAny = $this->cache->getStale();
            if ($cachedAny !== null && is_array($cachedAny['items'] ?? null)) {
                $transformed = $this->applyUserTransforms($cachedAny['items'], $settings);
                if ($transformed !== null) {
                    $cachedAny['meta']['instanceErrors'] = $cachedAny['meta']['instanceErrors'] ?? (object) [];
                    $cachedAny['items'] = $transformed['items'];
                    $cachedAny['meta']['etag'] = $transformed['etag'];
                    $cachedAny['meta']['freshness']  = 'fresh';
                    $cachedAny['meta']['staleSince'] = null;
                    $this->cache->set($cachedAny);
                    return $cachedAny;
                }
            }
        }

        // 3. No usable cache (first hit, wiped, or invalidated by a settings save)
        //    — block this one request to (re)seed the cache. Lock for stampede prevention.
        $lockDir = dirname($this->lockPath);
        if (!is_dir($lockDir)) {
            @mkdir($lockDir, 0700, true);
        }
        $lockFp = @fopen($this->lockPath, 'c');
        $haveLock = false;
        if ($lockFp !== false) {
            $haveLock = flock($lockFp, LOCK_EX | LOCK_NB);
        }

        try {
            $payload = $this->regenerate($settings);
            $this->cache->set($payload);
            return $payload;
        } catch (\Throwable $e) {
            Log::error('Aggregator: regeneration failed entirely', ['error' => $e->getMessage()]);
            return $this->emptyPayload(true);
        } finally {
            if ($lockFp !== false) {
                if ($haveLock) {
                    flock($lockFp, LOCK_UN);
                }
                fclose($lockFp);
            }
        }
    }

    /**
     * Force-regenerate the cache synchronously, holding the lock to prevent
     * stampedes. Called from the bin/regen_state.php background worker.
     */
    public function regenerateNow(): void
    {
        $lockDir = dirname($this->lockPath);
        if (!is_dir($lockDir)) {
            @mkdir($lockDir, 0700, true);
        }
        $lockFp = @fopen($this->lockPath, 'c');
        if ($lockFp === false) {
            return;
        }
        // Block briefly — if another regen is mid-flight, let it finish and we exit.
        if (!flock($lockFp, LOCK_EX | LOCK_NB)) {
            fclose($lockFp);
            return;
        }
        try {
            $payload = $this->regenerate(Store::read());
            $this->cache->set($payload);
        } catch (\Throwable $e) {
            Log::error('Aggregator: background regen failed', ['error' => $e->getMessage()]);
        } finally {
            flock($lockFp, LOCK_UN);
            fclose($lockFp);
        }
    }

    private function spawnBackgroundRegen(): void
    {
        // Probe the lock — if already held, a regen is in flight; nothing to do.
        $lockFp = @fopen($this->lockPath, 'c');
        if ($lockFp === false) {
            return;
        }
        $available = flock($lockFp, LOCK_EX | LOCK_NB);
        if ($available) {
            flock($lockFp, LOCK_UN);
        }
        fclose($lockFp);
        if (!$available) {
            return;
        }

        // Fork the regen as a detached background process. The worker re-acquires
        // the lock itself; release here was just to probe availability.
        $script = escapeshellarg(dirname(__DIR__, 2) . '/bin/regen_state.php');
        $php    = escapeshellarg(PHP_BINARY);
        @exec("{$php} {$script} > /dev/null 2>&1 &");
    }

    /**
     * @param array<string, mixed> $settings
     * @return array<string, mixed>
     */
    private function regenerate(array $settings): array
    {
        $instances = Safe::arr(Safe::get($settings, 'instances'));
        $itemConfig = Safe::arr(Safe::get($settings, 'itemConfig'));
        /** @var array<int, array<string, mixed>> $allItems */
        $allItems       = [];
        $instanceErrors = [];

        foreach ($instances as $inst) {
            if (!is_array($inst)) {
                continue;
            }
            $instanceId = Safe::str(Safe::get($inst, 'id'));
            $providerId = Safe::str(Safe::get($inst, 'provider'));
            $config     = Safe::arr(Safe::get($inst, 'config'));
            $items      = Safe::arr(Safe::get($inst, 'items'));
            if ($instanceId === '' || $providerId === '') {
                continue;
            }

            // Filter visible items only
            $visibleIds = [];
            $itemMeta   = [];
            foreach ($items as $it) {
                if (!is_array($it)) {
                    continue;
                }
                $iid = Safe::str(Safe::get($it, 'id'));
                if ($iid === '') {
                    continue;
                }
                if (Safe::bool(Safe::get($it, 'visible'), true)) {
                    $visibleIds[] = $iid;
                }
                $itemMeta[$iid] = $it;
            }
            if ($visibleIds === []) {
                continue;
            }

            if ($this->backoff->isCoolingDown($instanceId)) {
                $instanceErrors[$instanceId] = 'cooling down';
                foreach ($visibleIds as $iid) {
                    $allItems[] = $this->errorItem($instanceId, $providerId, $iid, $itemMeta[$iid] ?? null, 'Instance cooling down');
                }
                continue;
            }

            try {
                /** @var class-string<Provider> $cls */
                $cls      = Registry::get($providerId);
                $provider = new $cls();
                $fetched  = $provider->fetch($config, $visibleIds);
                $this->backoff->recordSuccess($instanceId);
            } catch (\Throwable $e) {
                $this->backoff->recordFailure($instanceId);
                $instanceErrors[$instanceId] = $e->getMessage();
                Log::warn('Aggregator: instance fetch failed', ['instance' => $instanceId, 'provider' => $providerId, 'error' => $e->getMessage()]);
                foreach ($visibleIds as $iid) {
                    $allItems[] = $this->errorItem($instanceId, $providerId, $iid, $itemMeta[$iid] ?? null, $e->getMessage());
                }
                continue;
            }

            // Normalize the items returned by the provider: stamp instanceId, apply rename override.
            $returnedIds = [];
            foreach ($fetched as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $iid = Safe::str(Safe::get($item, 'itemId'));
                if ($iid === '') {
                    continue;
                }
                $returnedIds[$iid] = true;

                $item['instanceId'] = $instanceId;
                // displayName override: itemConfig first, then instance items.displayName
                $override = Safe::str(Safe::get($itemConfig, $instanceId . ':' . $iid . '.displayName'))
                    ?: Safe::str(Safe::get($itemMeta, $iid . '.displayName'));
                if ($override !== '') {
                    $item['displayName'] = $override;
                }
                $allItems[] = $item;
            }

            // Any visible item the provider didn't return → synthesize an unknown placeholder.
            foreach ($visibleIds as $iid) {
                if (!isset($returnedIds[$iid])) {
                    $allItems[] = $this->errorItem($instanceId, $providerId, $iid, $itemMeta[$iid] ?? null, 'Item missing from upstream');
                }
            }
        }

        // Ordering: displayOrder first (cross-instance), then anything not listed in displayOrder appended in original order.
        $allItems = $this->applyDisplayOrder($allItems, Safe::arr(Safe::get($settings, 'displayOrder')));

        // Evaluate severity per item.
        foreach ($allItems as $i => $item) {
            $allItems[$i] = $this->evaluator->evaluate($item);
        }

        $payload = [
            'items' => $allItems,
            'meta'  => [
                'generatedAt'    => time(),
                'freshness'      => 'fresh',
                'staleSince'     => null,
                'instanceErrors' => $instanceErrors === [] ? (object) [] : $instanceErrors,
            ],
        ];
        $payload['meta']['etag'] = '"' . substr(hash('sha256', (string) json_encode([
            'items'          => $payload['items'],
            'instanceErrors' => $instanceErrors,
        ], JSON_THROW_ON_ERROR)), 0, 16) . '"';
        return $payload;
    }

    /**
     * Fast-path: rebuild a state payload from previously-cached items by filtering
     * to currently-visible items, applying name overrides, sorting, and recomputing
     * the ETag — without contacting any provider. Returns null when an item that
     * is now visible isn't in the cache (caller falls through to full regen).
     *
     * @param array<int, array<string, mixed>> $cachedItems
     * @param array<string, mixed>             $settings
     * @return array{items: array<int, array<string, mixed>>, etag: string}|null
     */
    private function applyUserTransforms(array $cachedItems, array $settings): ?array
    {
        $itemConfig = Safe::arr(Safe::get($settings, 'itemConfig'));

        // Index cached items by (instanceId, itemId).
        $byKey = [];
        foreach ($cachedItems as $it) {
            if (!is_array($it)) {
                continue;
            }
            $k = Safe::str($it['instanceId'] ?? '') . '|' . Safe::str($it['itemId'] ?? '');
            $byKey[$k] = $it;
        }

        // Build the visibility list from current settings. Apply rename overrides
        // as we collect. If any visible item lacks a cached entry, bail.
        $visible = [];
        foreach (Safe::arr(Safe::get($settings, 'instances')) as $inst) {
            if (!is_array($inst)) {
                continue;
            }
            $instanceId = Safe::str(Safe::get($inst, 'id'));
            if ($instanceId === '') {
                continue;
            }
            foreach (Safe::arr(Safe::get($inst, 'items')) as $row) {
                if (!is_array($row) || !Safe::bool(Safe::get($row, 'visible'), true)) {
                    continue;
                }
                $iid = Safe::str(Safe::get($row, 'id'));
                if ($iid === '') {
                    continue;
                }
                $key = $instanceId . '|' . $iid;
                if (!isset($byKey[$key])) {
                    return null; // newly-visible item not in cache → require fresh fetch
                }
                $item = $byKey[$key];
                $override = Safe::str(Safe::get($itemConfig, $instanceId . ':' . $iid . '.displayName'))
                    ?: Safe::str(Safe::get($row, 'displayName'));
                if ($override !== '') {
                    $item['displayName'] = $override;
                }
                $visible[] = $item;
            }
        }

        $ordered = $this->applyDisplayOrder($visible, Safe::arr(Safe::get($settings, 'displayOrder')));
        $etag    = '"' . substr(hash('sha256', (string) json_encode([
            'items'          => $ordered,
            'instanceErrors' => [],
        ], JSON_THROW_ON_ERROR)), 0, 16) . '"';

        return ['items' => $ordered, 'etag' => $etag];
    }

    /**
     * @param array<int, array<string, mixed>> $items
     * @param array<int, mixed>                $order
     * @return array<int, array<string, mixed>>
     */
    private function applyDisplayOrder(array $items, array $order): array
    {
        if ($order === []) {
            return $items;
        }
        $key = fn(array $it): string => Safe::str($it['instanceId'] ?? '') . '|' . Safe::str($it['itemId'] ?? '');
        $rank = [];
        foreach ($order as $i => $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $k = Safe::str(Safe::get($entry, 'instanceId')) . '|' . Safe::str(Safe::get($entry, 'itemId'));
            $rank[$k] = $i;
        }
        $maxRank = count($rank);
        $sorted  = $items;
        usort($sorted, function (array $a, array $b) use ($key, $rank, $maxRank): int {
            $ra = $rank[$key($a)] ?? $maxRank;
            $rb = $rank[$key($b)] ?? $maxRank;
            return $ra <=> $rb;
        });
        return $sorted;
    }

    /**
     * @param array<string, mixed>|null $meta
     * @return array<string, mixed>
     */
    private function errorItem(string $instanceId, string $providerId, string $itemId, ?array $meta, string $error): array
    {
        return [
            'instanceId'  => $instanceId,
            'providerId'  => $providerId,
            'itemId'      => $itemId,
            'displayName' => Safe::str($meta['displayName'] ?? null) ?: $itemId,
            'state'       => 'unknown',
            'severity'    => 'ok',
            'statusText'  => 'Unreachable',
            'lastSeenAt'  => 0,
            'elements'    => [],
            'error'       => $error,
        ];
    }

    private function emptyPayload(bool $stale): array
    {
        return [
            'items' => [],
            'meta'  => [
                'generatedAt'    => time(),
                'freshness'      => $stale ? 'stale' : 'fresh',
                'staleSince'     => $stale ? time() : null,
                'instanceErrors' => (object) [],
            ],
        ];
    }
}
