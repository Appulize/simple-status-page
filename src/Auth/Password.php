<?php
declare(strict_types=1);

namespace App\Auth;

class Password
{
    public static function hash(string $password): string
    {
        return (string) password_hash($password, PASSWORD_BCRYPT);
    }

    public static function verify(string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }
}
