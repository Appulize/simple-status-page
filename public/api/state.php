<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

use App\Http\Json;
use App\Http\Request;
use App\State\Aggregator;

sendSecurityHeaders();
header('Cache-Control: private, no-cache');

$req = new Request();
if ($req->method() !== 'GET' && $req->method() !== 'HEAD') {
    Json::methodNotAllowed();
}

$payload = (new Aggregator())->get();
$etag    = $payload['meta']['etag'] ?? '';

if (is_string($etag) && $etag !== '' && $req->ifNoneMatch() === $etag) {
    Json::notModified();
}

Json::ok($payload, 200, $etag !== '' ? ['ETag' => $etag] : []);
