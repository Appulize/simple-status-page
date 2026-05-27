<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

use App\Auth\Authenticator;
use App\Auth\Session;
use App\Config\Store;
use App\Http\Csrf;
use App\Http\Json;
use App\Http\Request;
use App\Providers\Registry;

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

$body = $req->json();

// Two modes:
//  1) { instanceId }              → discover for a saved instance
//  2) { provider, config }        → discover for an unsaved instance (wizard step 3)
$providerId = null;
$config     = null;

if (isset($body['instanceId']) && is_string($body['instanceId']) && $body['instanceId'] !== '') {
    foreach ($cfg['instances'] ?? [] as $inst) {
        if (($inst['id'] ?? null) === $body['instanceId']) {
            $providerId = (string) ($inst['provider'] ?? '');
            $config     = is_array($inst['config'] ?? null) ? $inst['config'] : [];
            break;
        }
    }
    if ($providerId === null) {
        Json::error('Unknown instanceId.', 404);
    }
} elseif (isset($body['provider']) && is_string($body['provider'])) {
    $providerId = $body['provider'];
    $config     = is_array($body['config'] ?? null) ? $body['config'] : [];
} else {
    Json::error('Body must contain instanceId or {provider, config}.', 400);
}

try {
    $cls = Registry::get($providerId);
} catch (\InvalidArgumentException) {
    Json::error("Unknown provider: $providerId", 400);
}

$instance = new $cls();
$check = $instance->validate($config);
if (!($check['ok'] ?? false)) {
    Json::error(implode(' ', $check['errors'] ?? ['Invalid config.']), 400);
}

try {
    $nodes = $instance->discover($config);
} catch (\Throwable $e) {
    error_log('[discover] ' . $providerId . ': ' . $e->getMessage());
    Json::error('Provider rejected the request: ' . $e->getMessage(), 502);
}

Json::ok([
    'provider' => $providerId,
    'nodes'    => $nodes,
]);
