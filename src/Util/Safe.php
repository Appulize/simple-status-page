<?php
declare(strict_types=1);

namespace App\Util;

class Safe
{
    public static function str(mixed $v, string $default = ''): string
    {
        if (!is_scalar($v)) {
            return $default;
        }
        return trim((string) $v);
    }

    public static function int(mixed $v, int $default = 0): int
    {
        if (is_bool($v) || !is_numeric($v)) {
            return $default;
        }
        return (int) $v;
    }

    public static function float(mixed $v, float $default = 0.0): float
    {
        if (is_bool($v) || !is_numeric($v)) {
            return $default;
        }
        return (float) $v;
    }

    public static function bool(mixed $v, bool $default = false): bool
    {
        if (is_bool($v)) {
            return $v;
        }
        if (is_string($v)) {
            return match (strtolower(trim($v))) {
                'true', '1', 'yes'   => true,
                'false', '0', 'no'   => false,
                default              => $default,
            };
        }
        return $default;
    }

    public static function arr(mixed $v, array $default = []): array
    {
        return is_array($v) ? $v : $default;
    }

    /**
     * Dot-notation nested get: Safe::get($arr, 'a.b.c', $default)
     */
    public static function get(array $arr, string $path, mixed $default = null): mixed
    {
        $current = $arr;
        foreach (explode('.', $path) as $key) {
            if (!is_array($current) || !array_key_exists($key, $current)) {
                return $default;
            }
            $current = $current[$key];
        }
        return $current;
    }
}
