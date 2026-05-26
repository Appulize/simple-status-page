<?php
declare(strict_types=1);

namespace App\Util;

class Log
{
    public static function info(string $msg, array $ctx = []): void
    {
        error_log(self::format('INFO', $msg, $ctx));
    }

    public static function warn(string $msg, array $ctx = []): void
    {
        error_log(self::format('WARN', $msg, $ctx));
    }

    public static function error(string $msg, array $ctx = []): void
    {
        error_log(self::format('ERROR', $msg, $ctx));
    }

    private static function format(string $level, string $msg, array $ctx): string
    {
        if ($ctx === []) {
            return "[$level] $msg";
        }
        $pairs = [];
        foreach ($ctx as $k => $v) {
            $pairs[] = $k . '=' . json_encode($v, JSON_UNESCAPED_SLASHES);
        }
        return "[$level] $msg {" . implode(', ', $pairs) . '}';
    }
}
