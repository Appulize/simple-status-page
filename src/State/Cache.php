<?php
declare(strict_types=1);

namespace App\State;

class Cache
{
    public const SCHEMA_VERSION = 1;

    private string $path;

    public function __construct(?string $path = null)
    {
        $this->path = $path ?? SSP_DATA_ROOT . '/cache/state.json';
    }

    public function path(): string
    {
        return $this->path;
    }

    /**
     * Return fresh cached payload, or null if missing/expired/schema-mismatched.
     *
     * @return array<string, mixed>|null
     */
    public function get(int $ttl): ?array
    {
        $entry = $this->readRaw();
        if ($entry === null) {
            return null;
        }
        $age = time() - (int) ($entry['cachedAt'] ?? 0);
        if ($age > $ttl) {
            return null;
        }
        return $entry['data'] ?? null;
    }

    /**
     * Return the last cached payload regardless of age. Used for stale-while-error.
     *
     * @return array<string, mixed>|null
     */
    public function getStale(): ?array
    {
        $entry = $this->readRaw();
        if ($entry === null) {
            return null;
        }
        return $entry['data'] ?? null;
    }

    /** @return int|null Unix timestamp of when the current cached payload was written. */
    public function cachedAt(): ?int
    {
        $entry = $this->readRaw();
        if ($entry === null) {
            return null;
        }
        $t = $entry['cachedAt'] ?? null;
        return is_int($t) ? $t : null;
    }

    /**
     * Atomically write a cache payload.
     *
     * @param array<string, mixed> $data
     */
    public function set(array $data): void
    {
        $dir = dirname($this->path);
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new \RuntimeException('Cannot create cache directory: ' . $dir);
        }

        $entry = [
            'schemaVersion' => self::SCHEMA_VERSION,
            'cachedAt'      => time(),
            'data'          => $data,
        ];
        $json = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

        $tmp = $this->path . '.tmp.' . bin2hex(random_bytes(4));
        if (file_put_contents($tmp, $json) === false) {
            throw new \RuntimeException('Cannot write cache temp file: ' . $tmp);
        }
        if (!rename($tmp, $this->path)) {
            @unlink($tmp);
            throw new \RuntimeException('Cannot rename cache temp to ' . $this->path);
        }
    }

    /**
     * Compute the cache TTL per PLAN §9: max(5, min(10, refreshIntervalSec / 2)).
     */
    public static function ttlFor(int $refreshIntervalSec): int
    {
        return max(5, min(10, (int) floor($refreshIntervalSec / 2)));
    }

    /** @return array<string, mixed>|null */
    private function readRaw(): ?array
    {
        if (!is_file($this->path)) {
            return null;
        }
        $raw = @file_get_contents($this->path);
        if ($raw === false || $raw === '') {
            return null;
        }
        try {
            $entry = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }
        if (!is_array($entry)) {
            return null;
        }
        if (($entry['schemaVersion'] ?? null) !== self::SCHEMA_VERSION) {
            return null;
        }
        return $entry;
    }
}
