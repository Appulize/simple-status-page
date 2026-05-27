<?php
declare(strict_types=1);

const APP_VERSION = '0.1.0';

// ── Data root ────────────────────────────────────────────────────────────────
// All runtime state lives under SSP_DATA_ROOT/{config,cache}. Defaults to the
// project root; tests set SSP_DATA_ROOT to a temp directory for isolation.
$dataRoot = getenv('SSP_DATA_ROOT');
if (!is_string($dataRoot) || $dataRoot === '') {
    $dataRoot = dirname(__DIR__);
}
define('SSP_DATA_ROOT', $dataRoot);

// ── PSR-4 autoloader (App\ → src/) ──────────────────────────────────────────
spl_autoload_register(function (string $class): void {
    $prefix = 'App\\';
    $base   = __DIR__ . '/';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    $file     = $base . str_replace('\\', '/', $relative) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

// ── Error handler ────────────────────────────────────────────────────────────
// Production: return an opaque 500 with a unique incident id so the caller
// gets something machine-readable; full details go to the FPM error log.
set_error_handler(function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new \ErrorException($message, 0, $severity, $file, $line);
});

set_exception_handler(function (\Throwable $e): void {
    $id = bin2hex(random_bytes(6));
    error_log(sprintf('[%s] %s: %s in %s:%d', $id, get_class($e), $e->getMessage(), $e->getFile(), $e->getLine()));
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json');
    }
    echo json_encode(['error' => 'Internal server error', 'id' => $id], JSON_THROW_ON_ERROR);
    exit(1);
});

// ── Session configuration (path + flags; do NOT start session here) ──────────
$sessionPath = SSP_DATA_ROOT . '/cache/sessions';
if (!is_dir($sessionPath)) {
    mkdir($sessionPath, 0700, true);
}
session_save_path($sessionPath);
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => '/',
    'domain'   => '',
    'secure'   => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true,
    'samesite' => 'Lax',
]);
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.cookie_httponly', '1');

// ── Security headers ─────────────────────────────────────────────────────────
// Must be sent before any output. Called from public/index.php and every
// public/api/*.php entry point.
function sendSecurityHeaders(string $extraScriptSrc = ''): void
{
    $scriptSrc = "'self'" . ($extraScriptSrc !== '' ? " $extraScriptSrc" : '');
    header("Content-Security-Policy: default-src 'self'; script-src $scriptSrc; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header("Permissions-Policy: camera=(), microphone=(), geolocation=()");

    // Only emit HSTS when the request was received over HTTPS; emitting it
    // over HTTP breaks plain-HTTP-only deployments.
    if (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }
}
