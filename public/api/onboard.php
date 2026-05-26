<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

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

if (!Store::isFirstRun()) {
    Json::error('Already configured.', 403);
}

$body     = $req->json();
$password = is_string($body['password'] ?? null) ? $body['password'] : '';

if (strlen($password) < 8) {
    Json::error('Password must be at least 8 characters.', 400);
}

$cfg                          = Store::read();
$cfg['auth']['passwordHash']  = Password::hash($password);
$cfg['auth']['methods']['form']['enabled'] = true;
Store::write($cfg);

Session::login();

Json::ok([
    'ok'        => true,
    'csrfToken' => Csrf::token(),
]);
