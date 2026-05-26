<?php
declare(strict_types=1);

namespace App\Providers;

class Registry
{
    /** @var array<string, class-string<Provider>> */
    private static array $map = [
        'uptimerobot' => UptimeRobot::class,
        'beszel'      => Beszel::class,
    ];

    /** @return class-string<Provider> */
    public static function get(string $id): string
    {
        if (!isset(self::$map[$id])) {
            throw new \InvalidArgumentException("Unknown provider: $id");
        }
        return self::$map[$id];
    }

    /** @return array<string, class-string<Provider>> */
    public static function all(): array
    {
        return self::$map;
    }
}
