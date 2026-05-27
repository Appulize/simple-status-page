<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

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

// Auth required: only admins can change the server-side appearance defaults.
$cfg = Store::read();
Authenticator::requireAuth($req, $cfg);

// CSRF required for session/form auth; bearer-token auth is CSRF-exempt
// (token presence implies the caller is not a browser session).
if ($req->bearerToken() === null) {
    Session::start();
    $csrf = $req->header('X-CSRF-Token') ?? '';
    if (!Csrf::validate($csrf)) {
        Json::error('Invalid CSRF token.', 403);
    }
}

// Whitelist + validate. Anything outside this list is rejected.
$allowed = [
    'theme'      => ['auto', 'light', 'dark'],
    'accent'     => ['mint', 'citron', 'violet', 'coral', 'ink'],
    'density'    => ['cozy', 'regular', 'airy'],
    'cardstyle'  => ['flat', 'paper', 'elev'],
    'mark'       => ['stripe', 'dot'],
    'mode'       => ['simple', 'detailed'],
    'sparklines' => 'bool',
    'summaryBar' => 'bool',
];

$body  = $req->json();
$patch = [];
foreach ($body as $k => $v) {
    if (!isset($allowed[$k])) {
        Json::error("Unknown field: {$k}", 400);
    }
    $spec = $allowed[$k];
    if ($spec === 'bool') {
        $patch[$k] = (bool) $v;
    } elseif (is_array($spec) && in_array($v, $spec, true)) {
        $patch[$k] = $v;
    } else {
        Json::error("Invalid value for {$k}", 400);
    }
}

if ($patch === []) {
    Json::error('No fields to update.', 400);
}

$cfg['ui'] = array_merge($cfg['ui'] ?? [], $patch);
Store::write($cfg);

Json::ok(['ok' => true, 'ui' => $cfg['ui']]);
