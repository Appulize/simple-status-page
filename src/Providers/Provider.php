<?php
declare(strict_types=1);

namespace App\Providers;

interface Provider
{
    public static function id(): string;

    public static function name(): string;

    public static function version(): int;

    /**
     * Field definitions the settings UI renders for this provider's instance config.
     * Each entry: ['key' => 'apiKey', 'label' => 'API key', 'type' => 'secret'|'text'|'url'|'email', 'required' => bool, 'help' => string].
     *
     * @return array<int, array<string, mixed>>
     */
    public static function configSchema(): array;

    /**
     * Validate an instance config blob without contacting the upstream.
     *
     * @param array<string, mixed> $config
     * @return array{ok: bool, errors: array<int, string>}
     */
    public function validate(array $config): array;

    /**
     * Contact the upstream and enumerate selectable nodes (hosts, disks, monitors, …).
     *
     * @param array<string, mixed> $config
     * @return array<int, array<string, mixed>>  DiscoveryNode[]
     */
    public function discover(array $config): array;

    /**
     * Fetch live data for the requested item ids and return normalized items.
     * Per-item failures degrade to a minimal item with state=unknown + error set;
     * upstream-level failures bubble as exceptions for the Aggregator to handle.
     *
     * @param array<string, mixed> $config
     * @param array<int, string>   $itemIds
     * @return array<int, array<string, mixed>>  NormalizedItem[]
     */
    public function fetch(array $config, array $itemIds): array;
}
