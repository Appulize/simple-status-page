<?php
declare(strict_types=1);

namespace App\Auth;

class Throttle
{
    private const MAX    = 5;
    private const WINDOW = 300; // seconds

    private static function dir(): string
    {
        return SSP_DATA_ROOT . '/cache/throttle';
    }

    private static function file(string $ip): string
    {
        return self::dir() . '/' . hash('sha256', $ip);
    }

    private static function read(string $ip): array
    {
        $file = self::file($ip);
        if (!is_file($file)) {
            return ['attempts' => 0, 'windowStart' => 0];
        }
        try {
            $data = json_decode((string) file_get_contents($file), true, 4, JSON_THROW_ON_ERROR);
            return is_array($data) ? $data : ['attempts' => 0, 'windowStart' => 0];
        } catch (\JsonException) {
            return ['attempts' => 0, 'windowStart' => 0];
        }
    }

    public static function isThrottled(string $ip): bool
    {
        $data = self::read($ip);
        if (time() - ($data['windowStart'] ?? 0) > self::WINDOW) {
            return false;
        }
        return ($data['attempts'] ?? 0) >= self::MAX;
    }

    public static function retryAfter(string $ip): int
    {
        $data = self::read($ip);
        return max(0, self::WINDOW - (time() - ($data['windowStart'] ?? 0)));
    }

    public static function recordFailure(string $ip): void
    {
        $dir = self::dir();
        if (!is_dir($dir)) {
            mkdir($dir, 0700, true);
        }
        $data = self::read($ip);
        $now  = time();
        if ($now - ($data['windowStart'] ?? 0) > self::WINDOW) {
            $data = ['attempts' => 1, 'windowStart' => $now];
        } else {
            $data['attempts'] = ($data['attempts'] ?? 0) + 1;
        }
        file_put_contents(self::file($ip), json_encode($data, JSON_THROW_ON_ERROR));
    }

    public static function clear(string $ip): void
    {
        $file = self::file($ip);
        if (is_file($file)) {
            unlink($file);
        }
    }
}
