<?php
// Dev router for PHP built-in server: php -S localhost:8099 -t public public/router.php
// Production uses Caddy and does not need this file. DO NOT deploy to the internet;
// the built-in server is single-threaded and not hardened for hostile traffic.
declare(strict_types=1);

$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$root = realpath(__DIR__);
if ($root === false) {
    require __DIR__ . '/index.php';
    return true;
}

// Resolve the candidate file and refuse to leave the webroot. parse_url already
// strips `..` segments in most cases but defence-in-depth here is cheap.
$candidate = $root . $path;
$resolved  = realpath($candidate);
$candidatePhp = realpath($candidate . '.php');

$insideRoot = static fn(string $r): bool => str_starts_with($r . DIRECTORY_SEPARATOR, $root . DIRECTORY_SEPARATOR);

if ($resolved !== false && $insideRoot($resolved) && is_file($resolved) && !str_ends_with($resolved, '.php')) {
    return false; // serve static assets as-is
}

if ($candidatePhp !== false && $insideRoot($candidatePhp) && is_file($candidatePhp)) {
    require $candidatePhp;
    return true;
}

require __DIR__ . '/index.php';
return true;
