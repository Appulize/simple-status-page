<?php
declare(strict_types=1);

namespace App\Auth;

use App\Http\Json;
use App\Http\Request;

class Authenticator
{
    /** Returns true if the request is authenticated by any enabled method. */
    public static function check(Request $req, array $cfg): bool
    {
        // 1. Session (form login)
        if (Session::isAuthenticated()) {
            return true;
        }

        // 2. Bearer token
        $token = $req->bearerToken();
        if ($token !== null && Token::verify($token, $cfg)) {
            return true;
        }

        // 3. HTTP Basic
        $basic = $req->basicAuth();
        if ($basic !== null && ($cfg['auth']['methods']['basic']['enabled'] ?? false)) {
            $hash = $cfg['auth']['passwordHash'] ?? '';
            if ($hash !== '' && Password::verify($basic['password'], $hash)) {
                return true;
            }
        }

        // 4. Client certificate forwarded by Caddy
        if ($cfg['auth']['methods']['clientCert']['enabled'] ?? false) {
            $headerName = $cfg['auth']['methods']['clientCert']['headerName'] ?? 'X-Client-Cert-Subject';
            $subject    = $req->header($headerName);
            if ($subject !== null) {
                $allowed = $cfg['auth']['methods']['clientCert']['allowedSubjects'] ?? [];
                if (in_array($subject, $allowed, true)) {
                    return true;
                }
            }
        }

        return false;
    }

    /** Terminates with 401 if not authenticated. */
    public static function requireAuth(Request $req, array $cfg): void
    {
        if (!self::check($req, $cfg)) {
            Json::unauthorized();
        }
    }
}
