<?php
declare(strict_types=1);

namespace App\Config;

class Store
{
    private static string $path = '';
    private static ?array $lastKnown = null;

    public static function init(string $configPath): void
    {
        self::$path = $configPath;
        self::$lastKnown = null;
    }

    public static function read(): array
    {
        $path = self::path();

        if (!is_file($path)) {
            return self::defaults();
        }

        $content = @file_get_contents($path);
        if ($content === false) {
            error_log('[Store] Cannot read ' . $path);
            return self::$lastKnown ?? self::defaults();
        }

        try {
            $data = json_decode($content, true, 16, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            error_log('[Store] Corrupt settings.json: ' . $e->getMessage());
            return self::$lastKnown ?? self::defaults();
        }

        if (!is_array($data)) {
            error_log('[Store] settings.json root is not an object');
            return self::$lastKnown ?? self::defaults();
        }

        $data = Migrations::run($data);
        self::$lastKnown = $data;
        return $data;
    }

    public static function write(array $data): void
    {
        $path = self::path();
        $dir  = dirname($path);

        if (!is_dir($dir) && !mkdir($dir, 0700, true)) {
            throw new \RuntimeException('Cannot create config directory: ' . $dir);
        }

        $lockFile = $dir . '/.lock';
        $lock = fopen($lockFile, 'c');
        if ($lock === false) {
            throw new \RuntimeException('Cannot open lock file: ' . $lockFile);
        }

        try {
            if (!flock($lock, LOCK_EX)) {
                throw new \RuntimeException('Cannot acquire write lock');
            }

            $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $tmp  = $path . '.tmp.' . bin2hex(random_bytes(4));

            if (file_put_contents($tmp, $json) === false) {
                throw new \RuntimeException('Cannot write temp file: ' . $tmp);
            }

            if (!rename($tmp, $path)) {
                @unlink($tmp);
                throw new \RuntimeException('Cannot rename temp file to ' . $path);
            }

            self::$lastKnown = $data;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /** Returns the settings.json mtime as a Unix timestamp, or 0 if absent. */
    public static function mtime(): int
    {
        $path = self::path();
        if (!is_file($path)) {
            return 0;
        }
        clearstatcache(true, $path);
        $m = @filemtime($path);
        return $m === false ? 0 : $m;
    }

    public static function isFirstRun(): bool
    {
        if (!is_file(self::path())) {
            return true;
        }
        $data = self::read();
        $hash = $data['auth']['passwordHash'] ?? '';
        return !is_string($hash) || $hash === '';
    }

    public static function defaults(): array
    {
        return [
            'schemaVersion' => 1,
            'auth' => [
                'passwordHash' => '',
                'methods' => [
                    'form'       => ['enabled' => true],
                    'basic'      => ['enabled' => false],
                    'token'      => ['enabled' => false, 'token' => ''],
                    'clientCert' => ['enabled' => false, 'headerName' => 'X-Client-Cert-Subject', 'allowedSubjects' => []],
                ],
            ],
            'ui' => [
                'siteTitle'          => null,
                'refreshIntervalSec' => 30,
                'theme'              => 'auto',
                'accent'             => 'mint',
                'cardstyle'          => 'paper',
                'mark'               => 'stripe',
                'density'            => 'regular',
                'mode'               => 'detailed',
                'sparklines'         => true,
                'summaryBar'         => true,
            ],
            'instances'    => [],
            'displayOrder' => [],
            'itemConfig'   => [],
        ];
    }

    private static function path(): string
    {
        if (self::$path === '') {
            self::$path = dirname(__DIR__, 2) . '/config/settings.json';
        }
        return self::$path;
    }
}
