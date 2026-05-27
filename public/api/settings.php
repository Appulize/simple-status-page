<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

use App\Auth\Authenticator;
use App\Auth\Session;
use App\Config\SettingsValidator;
use App\Config\Store;
use App\Http\Csrf;
use App\Http\Json;
use App\Http\Request;

sendSecurityHeaders();
header('Cache-Control: private, no-store');

$req = new Request();
$method = $req->method();
if ($method !== 'GET' && $method !== 'POST') {
    Json::methodNotAllowed();
}

$cfg = Store::read();
Authenticator::requireAuth($req, $cfg);

if ($method === 'GET') {
    $mtime = Store::mtime();
    Json::ok([
        'settings' => $cfg,
        'meta'     => ['mtime' => $mtime],
    ], 200, ['ETag' => '"' . $mtime . '"']);
}

// POST — CSRF required for session/form auth; bearer-token auth is CSRF-exempt
// (token presence implies the caller is not a browser session).
if ($req->bearerToken() === null) {
    Session::start();
    $csrf = $req->header('X-CSRF-Token') ?? '';
    if (!Csrf::validate($csrf)) {
        Json::error('Invalid CSRF token.', 403);
    }
}

$ifMatch = trim((string) $req->header('If-Match'), '"');
if ($ifMatch === '') {
    Json::error('If-Match header required.', 428);
}
$current = Store::mtime();
if ((string) $current !== $ifMatch) {
    http_response_code(409);
    header('Content-Type: application/json');
    echo json_encode([
        'error'    => 'Settings were modified by another writer.',
        'current'  => [
            'settings' => $cfg,
            'meta'     => ['mtime' => $current],
        ],
    ], JSON_THROW_ON_ERROR);
    exit;
}

$body = $req->json();
$incoming = is_array($body['settings'] ?? null) ? $body['settings'] : null;
if ($incoming === null) {
    Json::error('Missing settings body.', 400);
}

$result = SettingsValidator::validate($incoming, $cfg);
if (!($result['ok'] ?? false)) {
    Json::error((string) ($result['error'] ?? 'Invalid settings.'), (int) ($result['status'] ?? 400));
}

Store::write($result['merged']);

$mtime = Store::mtime();
Json::ok([
    'ok'   => true,
    'meta' => ['mtime' => $mtime],
], 200, ['ETag' => '"' . $mtime . '"']);
