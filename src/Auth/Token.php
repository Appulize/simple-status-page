<?php
declare(strict_types=1);

namespace App\Auth;

class Token
{
    public static function verify(string $token, array $cfg): bool
    {
        if (!($cfg['auth']['methods']['token']['enabled'] ?? false)) {
            return false;
        }
        $stored = $cfg['auth']['methods']['token']['token'] ?? '';
        return $stored !== '' && hash_equals($stored, $token);
    }
}
