<?php
declare(strict_types=1);

namespace Tests\Fixtures;

use App\Providers\Provider;

/**
 * Deterministic provider used only by AggregatorTest. Behavior is driven by
 * class-level static state so the Aggregator's `new $cls()` instantiation
 * still finds the data the test set.
 */
class FakeProvider implements Provider
{
    /** @var array<int, array<string, mixed>>|null */
    public static ?array $nextFetch = null;
    public static ?string $throwOnFetch = null;

    public static function reset(): void
    {
        self::$nextFetch = null;
        self::$throwOnFetch = null;
    }

    public static function id(): string { return 'fake'; }
    public static function name(): string { return 'Fake'; }
    public static function version(): int { return 1; }
    public static function configSchema(): array
    {
        return [[
            'key' => 'noop',
            'label' => 'Noop',
            'type' => 'text',
            'required' => false,
        ]];
    }

    public function validate(array $config): array
    {
        return ['ok' => true, 'errors' => []];
    }

    public function discover(array $config): array
    {
        return [];
    }

    public function fetch(array $config, array $itemIds): array
    {
        if (self::$throwOnFetch !== null) {
            throw new \RuntimeException(self::$throwOnFetch);
        }
        return self::$nextFetch ?? [];
    }
}
