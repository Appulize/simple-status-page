<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

use App\Auth\Password;
use App\Auth\Session;
use App\Auth\Throttle;
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

$ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');

if (Throttle::isThrottled($ip)) {
    header('Retry-After: ' . Throttle::retryAfter($ip));
    Json::error('Too many attempts. Try again later.', 429);
}

if (Store::isFirstRun()) {
    Json::error('No password set. Complete onboarding first.', 403);
}

$body     = $req->json();
$password = is_string($body['password'] ?? null) ? $body['password'] : '';

$cfg  = Store::read();
$hash = $cfg['auth']['passwordHash'] ?? '';

if ($hash === '' || !Password::verify($password, $hash)) {
    Throttle::recordFailure($ip);
    if (Throttle::isThrottled($ip)) {
        header('Retry-After: ' . Throttle::retryAfter($ip));
        Json::error('Too many attempts. Try again later.', 429);
    }
    Json::error('Incorrect password.', 401);
}

Throttle::clear($ip);
Session::login();

Json::ok([
    'authenticated' => true,
    'csrfToken'     => Csrf::token(),
]);
