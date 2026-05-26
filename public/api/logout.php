<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

use App\Auth\Session;
use App\Http\Json;
use App\Http\Request;

sendSecurityHeaders();
header('Cache-Control: private, no-store');

$req = new Request();
if ($req->method() !== 'POST') {
    Json::methodNotAllowed();
}

Session::destroy();

Json::ok(['ok' => true]);
