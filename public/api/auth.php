<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

use App\Auth\Session;
use App\Config\Store;
use App\Http\Csrf;
use App\Http\Json;
use App\Http\Request;

sendSecurityHeaders();
header('Cache-Control: private, no-store');

$req = new Request();
if ($req->method() !== 'GET') {
    Json::methodNotAllowed();
}

Session::start();

Json::ok([
    'authenticated' => Session::isAuthenticated(),
    'firstRun'      => Store::isFirstRun(),
    'csrfToken'     => Csrf::token(),
]);
