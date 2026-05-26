<?php
declare(strict_types=1);

namespace App\Auth;

class Session
{
    public static function start(): void
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
    }

    public static function isAuthenticated(): bool
    {
        self::start();
        return !empty($_SESSION['authenticated']);
    }

    public static function login(): void
    {
        self::start();
        session_regenerate_id(true);
        $_SESSION['authenticated'] = true;
    }

    public static function destroy(): void
    {
        self::start();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
    }
}
