<?php
declare(strict_types=1);

namespace App\Providers;

use App\State\HttpClient;
use App\Util\Log;
use App\Util\Safe;

class Beszel implements Provider
{
    private HttpClient $http;
    /** Cached auth token, scoped to a single fetch/discover call. */
    private ?string $token = null;
    private bool $reauthAttempted = false;

    /**
     * For tests: a captured list of {url, body} responses keyed by URL substring.
     * @var array<string, array{body: string, status: int, headers: array<string, string>}>|null
     */
    public ?array $fakeRoutes = null;

    public function __construct(?HttpClient $http = null)
    {
        $this->http = $http ?? new HttpClient();
    }

    public static function id(): string
    {
        return 'beszel';
    }

    public static function name(): string
    {
        return 'Beszel';
    }

    public static function version(): int
    {
        return 1;
    }

    public static function configSchema(): array
    {
        return [
            ['key' => 'url',      'label' => 'Hub URL',  'type' => 'url',    'required' => true, 'help' => 'Base URL of your Beszel hub (https://…). No trailing slash.'],
            ['key' => 'username', 'label' => 'Username', 'type' => 'email',  'required' => true, 'help' => 'A regular user account assigned to the systems you want to monitor.'],
            ['key' => 'password', 'label' => 'Password', 'type' => 'secret', 'required' => true, 'help' => ''],
        ];
    }

    public function validate(array $config): array
    {
        $errors = [];
        $url = Safe::str(Safe::get($config, 'url'));
        if ($url === '') {
            $errors[] = 'Hub URL is required.';
        } elseif (!preg_match('#^https?://[^\s]+$#', $url)) {
            $errors[] = 'Hub URL must be a valid http(s) URL.';
        }
        if (Safe::str(Safe::get($config, 'username')) === '') {
            $errors[] = 'Username is required.';
        }
        if (Safe::str(Safe::get($config, 'password')) === '') {
            $errors[] = 'Password is required.';
        }
        return ['ok' => $errors === [], 'errors' => $errors];
    }

    public function discover(array $config): array
    {
        $this->resetAuth();
        $systems = $this->listSystems($config);
        $nodes   = [];

        foreach ($systems as $s) {
            if (!is_array($s)) {
                continue;
            }
            $sid  = Safe::str(Safe::get($s, 'id'));
            $name = Safe::str(Safe::get($s, 'name'), $sid) ?: $sid;
            $host = Safe::str(Safe::get($s, 'host'));
            if ($sid === '') {
                continue;
            }

            // Parent system node
            $nodes[] = [
                'id'       => $sid,
                'label'    => $name,
                'kind'     => 'host',
                'parentId' => null,
                'hints'    => $host !== '' ? $host : null,
            ];

            // Fetch latest stats + details to enumerate sub-items (NICs, extra disks, containers).
            try {
                $stats   = $this->latestStats($config, $sid);
                $details = $this->systemDetails($config, $sid);
            } catch (\Throwable $e) {
                Log::warn('Beszel: discovery sub-items skipped', ['system' => $sid, 'error' => $e->getMessage()]);
                continue;
            }

            // Per-NIC sub-items
            foreach (Safe::arr(Safe::get($stats, 'ni')) as $nic => $_v) {
                if (!is_string($nic) || $nic === '') {
                    continue;
                }
                $nodes[] = [
                    'id'       => $sid . '::nic::' . $nic,
                    'label'    => $nic,
                    'kind'     => 'interface',
                    'parentId' => $sid,
                    'hints'    => 'Network interface',
                ];
            }

            // Per-extra-filesystem sub-items (defensive — present on some agents)
            foreach (Safe::arr(Safe::get($stats, 'efs')) as $mount => $_v) {
                if (!is_string($mount) || $mount === '') {
                    continue;
                }
                $nodes[] = [
                    'id'       => $sid . '::disk::' . $mount,
                    'label'    => $mount,
                    'kind'     => 'disk',
                    'parentId' => $sid,
                    'hints'    => 'Disk',
                ];
            }
        }

        return $nodes;
    }

    public function fetch(array $config, array $itemIds): array
    {
        if ($itemIds === []) {
            return [];
        }
        $this->resetAuth();

        // Group requested ids by parent system.
        /** @var array<string, array<int, string>> $byParent */
        $byParent = [];
        foreach ($itemIds as $rawId) {
            $id = (string) $rawId;
            $parent = $this->parentOf($id);
            if ($parent === '') {
                continue;
            }
            $byParent[$parent][] = $id;
        }
        if ($byParent === []) {
            return [];
        }

        // List all systems once so we have status + name without a per-id round-trip.
        $systems = $this->listSystems($config);
        /** @var array<string, array<string, mixed>> $sysById */
        $sysById = [];
        foreach ($systems as $s) {
            if (is_array($s)) {
                $sid = Safe::str(Safe::get($s, 'id'));
                if ($sid !== '') {
                    $sysById[$sid] = $s;
                }
            }
        }

        $items = [];
        foreach ($byParent as $parent => $ids) {
            $sys = $sysById[$parent] ?? null;
            try {
                $stats   = $sys !== null ? $this->latestStats($config, $parent) : [];
                $details = $sys !== null ? $this->systemDetails($config, $parent) : [];
                $history = $sys !== null ? $this->statsHistory($config, $parent) : [];
            } catch (\Throwable $e) {
                Log::warn('Beszel: per-system fetch failed', ['system' => $parent, 'error' => $e->getMessage()]);
                $stats = $details = $history = [];
                $sys = $sys ?? ['id' => $parent, 'name' => $parent, 'status' => 'pending'];
            }

            foreach ($ids as $id) {
                try {
                    if ($id === $parent) {
                        $items[] = $this->buildSystemItem((array) $sys, $stats, $details, $history);
                    } elseif (str_contains($id, '::nic::')) {
                        $items[] = $this->buildNicItem($id, (array) $sys, $stats, $history);
                    } elseif (str_contains($id, '::disk::')) {
                        $items[] = $this->buildDiskItem($id, (array) $sys, $stats);
                    } else {
                        $items[] = $this->minimalItem($id, 'Unknown sub-item kind');
                    }
                } catch (\Throwable $e) {
                    Log::warn('Beszel: item parse failed', ['id' => $id, 'error' => $e->getMessage()]);
                    $items[] = $this->minimalItem($id, $e->getMessage());
                }
            }
        }
        return $items;
    }

    // ── HTTP helpers ────────────────────────────────────────────────────────

    private function resetAuth(): void
    {
        $this->token = null;
        $this->reauthAttempted = false;
    }

    private function authenticate(array $config): string
    {
        $url = rtrim(Safe::str(Safe::get($config, 'url')), '/') . '/api/collections/users/auth-with-password';
        $body = json_encode([
            'identity' => Safe::str(Safe::get($config, 'username')),
            'password' => Safe::str(Safe::get($config, 'password')),
        ], JSON_THROW_ON_ERROR);

        $resp = $this->httpRequest('POST', $url, ['Content-Type' => 'application/json'], $body);
        if ($resp['status'] < 200 || $resp['status'] >= 300) {
            throw new \RuntimeException('Beszel auth HTTP ' . $resp['status']);
        }
        $json = $this->decodeJson($resp['body'], 'auth');
        $tok  = Safe::str(Safe::get($json, 'token'));
        if ($tok === '') {
            throw new \RuntimeException('Beszel auth: missing token in response');
        }
        return $tok;
    }

    /**
     * GET with auto-reauth on 401.
     *
     * @return array<string, mixed>
     */
    private function getJson(array $config, string $path): array
    {
        $base = rtrim(Safe::str(Safe::get($config, 'url')), '/');
        $url  = $base . $path;

        if ($this->token === null) {
            $this->token = $this->authenticate($config);
        }

        $resp = $this->httpRequest('GET', $url, ['Authorization' => $this->token]);
        if ($resp['status'] === 401 && !$this->reauthAttempted) {
            $this->reauthAttempted = true;
            $this->token = $this->authenticate($config);
            $resp = $this->httpRequest('GET', $url, ['Authorization' => $this->token]);
        }
        if ($resp['status'] < 200 || $resp['status'] >= 300) {
            throw new \RuntimeException('Beszel HTTP ' . $resp['status'] . ' on ' . $path);
        }
        return $this->decodeJson($resp['body'], $path);
    }

    /** @param array<string, mixed> $headers */
    private function httpRequest(string $method, string $url, array $headers, ?string $body = null): array
    {
        // Allow tests to short-circuit by URL fragment match.
        if ($this->fakeRoutes !== null) {
            foreach ($this->fakeRoutes as $needle => $resp) {
                if (str_contains($url, (string) $needle)) {
                    return $resp;
                }
            }
            throw new \RuntimeException('FakeRoutes: no match for ' . $url);
        }
        /** @var array<string, string> $headers */
        return $this->http->request($method, $url, $headers, $body);
    }

    private function decodeJson(string $body, string $label): array
    {
        try {
            $j = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            throw new \RuntimeException('Beszel: invalid JSON from ' . $label . ': ' . $e->getMessage());
        }
        return is_array($j) ? $j : [];
    }

    // ── API wrappers ────────────────────────────────────────────────────────

    /** @return array<int, mixed> */
    private function listSystems(array $config): array
    {
        $j = $this->getJson($config, '/api/collections/systems/records?perPage=200');
        return Safe::arr(Safe::get($j, 'items'));
    }

    /** @return array<string, mixed> stats blob from the latest 1m record (or empty) */
    private function latestStats(array $config, string $systemId): array
    {
        $records = $this->statsHistory($config, $systemId);
        $latest  = $records[0] ?? [];
        if (!is_array($latest)) {
            return [];
        }
        $stats = $latest['stats'] ?? null;
        return is_array($stats) ? $stats : [];
    }

    /** @return array<int, mixed> raw 1m stats records, newest-first */
    private function statsHistory(array $config, string $systemId): array
    {
        $filter = "system='" . $this->escapePbValue($systemId) . "' && type='1m'";
        $path = '/api/collections/system_stats/records?filter=' . rawurlencode($filter) . '&sort=-created&perPage=60';
        $j = $this->getJson($config, $path);
        return Safe::arr(Safe::get($j, 'items'));
    }

    /** @return array<string, mixed> */
    private function systemDetails(array $config, string $systemId): array
    {
        $filter = "system='" . $this->escapePbValue($systemId) . "'";
        $path = '/api/collections/system_details/records?filter=' . rawurlencode($filter) . '&perPage=1';
        $j = $this->getJson($config, $path);
        $items = Safe::arr(Safe::get($j, 'items'));
        return is_array($items[0] ?? null) ? $items[0] : [];
    }

    private function escapePbValue(string $v): string
    {
        return str_replace(["\\", "'"], ["\\\\", "\\'"], $v);
    }

    // ── Item builders ───────────────────────────────────────────────────────

    /**
     * @param array<string, mixed> $sys
     * @param array<string, mixed> $stats
     * @param array<string, mixed> $details
     * @param array<int, mixed>    $history  raw 1m records newest-first
     * @return array<string, mixed>
     */
    private function buildSystemItem(array $sys, array $stats, array $details, array $history): array
    {
        $sid   = Safe::str(Safe::get($sys, 'id'));
        $name  = Safe::str(Safe::get($sys, 'name'), $sid) ?: $sid;
        $rawSt = Safe::str(Safe::get($sys, 'status'), 'pending');
        [$state, $statusText, $sevHint] = $this->mapStatus($rawSt);

        $elements = [];

        // gauge cpu
        $cpu = $this->extractNumber($stats, 'cpu');
        if ($cpu !== null) {
            $elements[] = [
                'type'    => 'gauge',
                'key'     => 'cpu',
                'label'   => 'CPU',
                'value'   => $cpu,
                'unit'    => '%',
                'max'     => 100,
                'history' => $this->buildSparkline($history, 'cpu'),
            ];
        }

        // gauge mem — prefer `mp` (memory percent), fall back to memPct/memUsed
        $mem = $this->extractNumber($stats, 'mp')
            ?? $this->extractNumber($stats, 'memPct')
            ?? $this->extractNumber($stats, 'memUsed');
        if ($mem !== null) {
            $elements[] = [
                'type'    => 'gauge',
                'key'     => 'mem',
                'label'   => 'Memory',
                'value'   => $mem,
                'unit'    => '%',
                'max'     => 100,
                'history' => $this->buildSparkline($history, 'mp'),
            ];
        }

        // gauge disk — primary disk %
        $disk = $this->extractNumber($stats, 'dp')
            ?? $this->extractNumber($stats, 'diskPct')
            ?? $this->extractNumber($stats, 'diskUsed');
        if ($disk !== null) {
            $elements[] = [
                'type'  => 'gauge',
                'key'   => 'disk',
                'label' => 'Disk',
                'value' => $disk,
                'unit'  => '%',
                'max'   => 100,
            ];
        }

        // counters net_rx / net_tx — `b` is [bandwidth_recv, bandwidth_sent] in MB
        $b = Safe::get($stats, 'b');
        if (is_array($b)) {
            $rx = $this->extractNumber($b, '0');
            $tx = $this->extractNumber($b, '1');
            if ($rx !== null) {
                $elements[] = [
                    'type'  => 'counter',
                    'key'   => 'net_rx',
                    'label' => 'Net in',
                    'value' => $rx,
                    'unit'  => 'MB/s',
                ];
            }
            if ($tx !== null) {
                $elements[] = [
                    'type'  => 'counter',
                    'key'   => 'net_tx',
                    'label' => 'Net out',
                    'value' => $tx,
                    'unit'  => 'MB/s',
                ];
            }
        }

        // text — hostname / OS / kernel / cpu / uptime
        $rows = [];
        if (($hn = Safe::str(Safe::get($details, 'hostname'))) !== '') {
            $rows[] = ['label' => 'Hostname', 'value' => $hn, 'mono' => true];
        }
        if (($osn = Safe::str(Safe::get($details, 'os_name'))) !== '') {
            $rows[] = ['label' => 'OS', 'value' => $osn];
        }
        if (($kr = Safe::str(Safe::get($details, 'kernel'))) !== '') {
            $rows[] = ['label' => 'Kernel', 'value' => $kr, 'mono' => true];
        }
        if (($cpuName = Safe::str(Safe::get($details, 'cpu'))) !== '') {
            $cores = Safe::int(Safe::get($details, 'cores'));
            $rows[] = ['label' => 'CPU', 'value' => $cores > 0 ? "$cpuName · {$cores}c" : $cpuName];
        }
        $uptimeSec = Safe::int(Safe::get($sys, 'info.u'));
        if ($uptimeSec > 0) {
            $rows[] = ['label' => 'Uptime', 'value' => $this->formatDuration($uptimeSec)];
        }
        if ($rows !== []) {
            $elements[] = ['type' => 'text', 'key' => 'info', 'rows' => $rows];
        }

        return [
            'providerId'  => self::id(),
            'itemId'      => $sid,
            'displayName' => $name,
            'state'       => $state,
            'severity'    => 'ok', // evaluator overwrites
            'statusText'  => $statusText,
            'lastSeenAt'  => $this->parseTime(Safe::str(Safe::get($sys, 'updated'))),
            'elements'    => $elements,
            'error'       => null,
            '_providerSeverityHint' => $sevHint,
        ];
    }

    /**
     * @param array<string, mixed> $sys
     * @param array<string, mixed> $stats
     * @param array<int, mixed>    $history
     * @return array<string, mixed>
     */
    private function buildNicItem(string $id, array $sys, array $stats, array $history): array
    {
        $nic = substr($id, strrpos($id, '::') + 2);
        $arr = Safe::arr(Safe::get($stats, 'ni.' . $nic));
        $rxVal = $this->extractNumber($arr, '2'); // total received bytes
        $txVal = $this->extractNumber($arr, '3'); // total sent bytes
        $curRx = $this->extractNumber($arr, '0'); // instantaneous recv
        $curTx = $this->extractNumber($arr, '1'); // instantaneous sent

        $rawSt = Safe::str(Safe::get($sys, 'status'), 'pending');
        [$state, $statusText, $sevHint] = $this->mapStatus($rawSt);

        $elements = [];
        if ($curRx !== null) {
            $elements[] = [
                'type'    => 'counter',
                'key'     => 'net_rx',
                'label'   => 'In',
                'value'   => $curRx,
                'unit'    => 'MB/s',
                'history' => $this->buildSparkline($history, 'ni.' . $nic . '.0'),
            ];
        }
        if ($curTx !== null) {
            $elements[] = [
                'type'    => 'counter',
                'key'     => 'net_tx',
                'label'   => 'Out',
                'value'   => $curTx,
                'unit'    => 'MB/s',
                'history' => $this->buildSparkline($history, 'ni.' . $nic . '.1'),
            ];
        }
        if ($rxVal !== null || $txVal !== null) {
            $rows = [];
            if ($rxVal !== null) { $rows[] = ['label' => 'Total in',  'value' => $this->formatBytes((float) $rxVal)]; }
            if ($txVal !== null) { $rows[] = ['label' => 'Total out', 'value' => $this->formatBytes((float) $txVal)]; }
            $elements[] = ['type' => 'text', 'key' => 'totals', 'rows' => $rows];
        }

        return [
            'providerId'  => self::id(),
            'itemId'      => $id,
            'displayName' => $nic,
            'state'       => $state,
            'severity'    => 'ok',
            'statusText'  => $statusText,
            'lastSeenAt'  => $this->parseTime(Safe::str(Safe::get($sys, 'updated'))),
            'elements'    => $elements,
            'error'       => null,
            '_providerSeverityHint' => $sevHint,
        ];
    }

    /**
     * @param array<string, mixed> $sys
     * @param array<string, mixed> $stats
     * @return array<string, mixed>
     */
    private function buildDiskItem(string $id, array $sys, array $stats): array
    {
        $mount = substr($id, strrpos($id, '::') + 2);
        $arr   = Safe::arr(Safe::get($stats, 'efs.' . $mount));
        $pct   = $this->extractNumber($arr, 'dp')
            ?? $this->extractNumber($arr, 'usedPct');
        $used  = $this->extractNumber($arr, 'du');
        $total = $this->extractNumber($arr, 'd');

        $rawSt = Safe::str(Safe::get($sys, 'status'), 'pending');
        [$state, $statusText, $sevHint] = $this->mapStatus($rawSt);

        $elements = [];
        if ($pct !== null) {
            $elements[] = [
                'type'  => 'gauge',
                'key'   => 'disk',
                'label' => 'Fill',
                'value' => $pct,
                'unit'  => '%',
                'max'   => 100,
            ];
        }
        if ($used !== null || $total !== null) {
            $rows = [];
            if ($used  !== null) { $rows[] = ['label' => 'Used',  'value' => $used  . ' GB']; }
            if ($total !== null) { $rows[] = ['label' => 'Total', 'value' => $total . ' GB']; }
            $elements[] = ['type' => 'text', 'key' => 'size', 'rows' => $rows];
        }

        return [
            'providerId'  => self::id(),
            'itemId'      => $id,
            'displayName' => $mount,
            'state'       => $state,
            'severity'    => 'ok',
            'statusText'  => $statusText,
            'lastSeenAt'  => $this->parseTime(Safe::str(Safe::get($sys, 'updated'))),
            'elements'    => $elements,
            'error'       => null,
            '_providerSeverityHint' => $sevHint,
        ];
    }

    /** @return array<string, mixed> */
    private function minimalItem(string $id, string $error): array
    {
        return [
            'providerId'  => self::id(),
            'itemId'      => $id,
            'displayName' => $id,
            'state'       => 'unknown',
            'severity'    => 'ok',
            'statusText'  => 'Error',
            'lastSeenAt'  => 0,
            'elements'    => [],
            'error'       => $error,
        ];
    }

    // ── Mapping + utilities ─────────────────────────────────────────────────

    /** @return array{0:string,1:string,2:?string} state, statusText, evaluator-hint */
    private function mapStatus(string $raw): array
    {
        return match (strtolower($raw)) {
            'up'      => ['active',  'Operational',     null],
            'down'    => ['active',  'Down',            'down'],
            'paused'  => ['paused',  'Paused',          null],
            'pending' => ['unknown', 'Not checked yet', null],
            default   => ['unknown', 'Unknown',         null],
        };
    }

    /**
     * Extract a numeric value at dot-path from a mixed structure. Returns null if missing or non-numeric.
     */
    private function extractNumber(array $arr, string $path): ?float
    {
        $v = Safe::get($arr, $path);
        if ($v === null) {
            return null;
        }
        if (is_int($v) || is_float($v)) {
            return (float) $v;
        }
        if (is_string($v) && is_numeric($v)) {
            return (float) $v;
        }
        return null;
    }

    /**
     * Walk historical 1m stats records (newest-first), pull one numeric path
     * from each, reverse to oldest-first for sparkline rendering.
     *
     * @param array<int, mixed> $history
     * @return array{intervalSec:int,values:array<int,float>}
     */
    private function buildSparkline(array $history, string $path): array
    {
        $values = [];
        foreach ($history as $rec) {
            if (!is_array($rec)) {
                continue;
            }
            $stats = $rec['stats'] ?? null;
            if (!is_array($stats)) {
                continue;
            }
            $v = $this->extractNumber($stats, $path);
            $values[] = $v ?? 0.0;
        }
        return [
            'intervalSec' => 60,
            'values'      => array_reverse($values),
        ];
    }

    private function parseTime(string $iso): int
    {
        if ($iso === '') {
            return 0;
        }
        // PocketBase: "2026-05-26 18:58:36.804Z" — strtotime handles this.
        $t = strtotime($iso);
        return $t === false ? 0 : $t;
    }

    private function formatDuration(int $sec): string
    {
        if ($sec < 60)        { return $sec . 's'; }
        if ($sec < 3600)      { return intdiv($sec, 60) . 'm'; }
        if ($sec < 86400)     { return intdiv($sec, 3600) . 'h'; }
        return intdiv($sec, 86400) . 'd';
    }

    private function formatBytes(float $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $i = 0;
        while ($bytes >= 1024 && $i < count($units) - 1) {
            $bytes /= 1024;
            $i++;
        }
        return sprintf('%.1f %s', $bytes, $units[$i]);
    }

    private function parentOf(string $id): string
    {
        $pos = strpos($id, '::');
        return $pos === false ? $id : substr($id, 0, $pos);
    }
}
