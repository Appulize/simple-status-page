<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

use App\Auth\Authenticator;
use App\Config\Store;
use App\Http\Json;
use App\Http\Request;
use App\Providers\Registry;

sendSecurityHeaders();
header('Cache-Control: private, no-store');

$req = new Request();
if ($req->method() !== 'GET') {
    Json::methodNotAllowed();
}

$cfg = Store::read();
Authenticator::requireAuth($req, $cfg);

$out = [];
foreach (Registry::all() as $id => $cls) {
    $out[] = [
        'id'           => $cls::id(),
        'name'         => $cls::name(),
        'version'      => $cls::version(),
        'configSchema' => $cls::configSchema(),
    ];
}

Json::ok(['providers' => $out]);
