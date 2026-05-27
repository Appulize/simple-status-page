<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

use App\Auth\Authenticator;
use App\Auth\Password;
use App\Auth\Session;
use App\Config\Store;
use App\Http\Csrf;
use App\Http\Json;
use App\Http\Request;

sendSecurityHeaders();
header('Cache-Control: private, no-store');

$req = new Request();
if ($req->method() !== 'POST') {
    Json::methodNotAllowed();
}

$cfg = Store::read();
Authenticator::requireAuth($req, $cfg);

if ($req->bearerToken() === null) {
    Session::start();
    $csrf = $req->header('X-CSRF-Token') ?? '';
    if (!Csrf::validate($csrf)) {
        Json::error('Invalid CSRF token.', 403);
    }
}

$body    = $req->json();
$current = is_string($body['current'] ?? null) ? $body['current'] : '';
$new     = is_string($body['new']     ?? null) ? $body['new']     : '';

$hash = (string) ($cfg['auth']['passwordHash'] ?? '');
if ($hash === '' || !Password::verify($current, $hash)) {
    Json::error('Current password is incorrect.', 401);
}
if (strlen($new) < 8) {
    Json::error('New password must be at least 8 characters.', 400);
}

$cfg['auth']['passwordHash'] = Password::hash($new);
Store::write($cfg);

// Forces re-login on the new password.
Session::destroy();

Json::ok(['ok' => true]);
