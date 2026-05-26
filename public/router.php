<?php
// Dev router for PHP built-in server: php -S localhost:8099 -t public public/router.php
// Production uses Caddy and does not need this file.
declare(strict_types=1);

$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$file = __DIR__ . $path;

if (is_file($file) && !str_ends_with($file, '.php')) {
    return false; // serve static assets as-is
}

if (is_file($file . '.php')) {
    require $file . '.php';
    return true;
}

require __DIR__ . '/index.php';
return true;
