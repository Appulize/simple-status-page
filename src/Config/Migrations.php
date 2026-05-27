<?php
declare(strict_types=1);

namespace App\Config;

class Migrations
{
    /** Highest schema version this codebase knows how to read. */
    public const CURRENT = 1;

    public static function run(array $data): array
    {
        $version = $data['schemaVersion'] ?? null;
        if ($version === null) {
            $data['schemaVersion'] = self::CURRENT;
            return $data;
        }
        if (!is_int($version) || $version < 1) {
            throw new \RuntimeException(
                'settings.json has invalid schemaVersion; refusing to read.'
            );
        }
        if ($version > self::CURRENT) {
            // Downgrade case: a newer codebase wrote the config, an older one
            // is reading it. Fail loudly rather than silently dropping fields.
            throw new \RuntimeException(sprintf(
                'settings.json schemaVersion %d is newer than this build supports (max %d). Refusing to read.',
                $version,
                self::CURRENT
            ));
        }
        return $data;
    }
}
