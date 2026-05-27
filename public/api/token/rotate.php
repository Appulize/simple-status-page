<?php
declare(strict_types=1);
require_once dirname(__DIR__, 3) . '/src/bootstrap.php';

use App\Auth\Authenticator;
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

$token = bin2hex(random_bytes(32));
$cfg['auth']['methods']['token']['token']   = $token;
$cfg['auth']['methods']['token']['enabled'] = $cfg['auth']['methods']['token']['enabled'] ?? false;
Store::write($cfg);

Json::ok([
    'ok'    => true,
    'token' => $token,
]);
