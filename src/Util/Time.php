<?php
declare(strict_types=1);

namespace App\Util;

class Time
{
    public static function now(): int
    {
        return time();
    }
}
