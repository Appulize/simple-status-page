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

    /**
     * Register a provider class under a string id. Used by tests to inject
     * a deterministic provider; production callers should not need this.
     *
     * @param class-string<Provider> $cls
     */
    public static function register(string $id, string $cls): void
    {
        self::$map[$id] = $cls;
    }
}
