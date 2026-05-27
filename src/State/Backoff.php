<?php
declare(strict_types=1);

namespace App\State;

/**
 * Per-instance exponential backoff. Best-effort persistence to cache/backoff.json;
 * loss is acceptable (worst case: a freshly-failing instance gets hit on the next poll).
 */
class Backoff
{
    private const INITIAL_DELAY = 30;
    private const MAX_DELAY     = 300;

    private string $path;
    /** @var array<string, array{nextAttemptAt: int, delay: int}> */
    private array $state;
    private bool $loaded = false;

    public function __construct(?string $path = null)
    {
        $this->path  = $path ?? SSP_DATA_ROOT . '/cache/backoff.json';
        $this->state = [];
    }

    public function isCoolingDown(string $instanceId): bool
    {
        $this->loadIfNeeded();
        $entry = $this->state[$instanceId] ?? null;
        if ($entry === null) {
            return false;
        }
        return time() < $entry['nextAttemptAt'];
    }

    public function recordFailure(string $instanceId): void
    {
        $this->loadIfNeeded();
        $current = $this->state[$instanceId] ?? null;
        $delay   = $current === null
            ? self::INITIAL_DELAY
            : min(self::MAX_DELAY, $current['delay'] * 2);
        $this->state[$instanceId] = [
            'nextAttemptAt' => time() + $delay,
            'delay'         => $delay,
        ];
        $this->save();
    }

    public function recordSuccess(string $instanceId): void
    {
        $this->loadIfNeeded();
        if (isset($this->state[$instanceId])) {
            unset($this->state[$instanceId]);
            $this->save();
        }
    }

    private function loadIfNeeded(): void
    {
        if ($this->loaded) {
            return;
        }
        $this->loaded = true;
        if (!is_file($this->path)) {
            return;
        }
        $raw = @file_get_contents($this->path);
        if ($raw === false || $raw === '') {
            return;
        }
        try {
            $data = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return;
        }
        if (!is_array($data)) {
            return;
        }
        foreach ($data as $id => $entry) {
            if (!is_string($id) || !is_array($entry)) {
                continue;
            }
            $next  = $entry['nextAttemptAt'] ?? null;
            $delay = $entry['delay'] ?? null;
            if (!is_int($next) || !is_int($delay)) {
                continue;
            }
            $this->state[$id] = ['nextAttemptAt' => $next, 'delay' => $delay];
        }
    }

    private function save(): void
    {
        $dir = dirname($this->path);
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            return;
        }
        $json = @json_encode($this->state, JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            return;
        }
        @file_put_contents($this->path, $json);
    }
}
