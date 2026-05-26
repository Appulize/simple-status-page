<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

use App\Http\Json;
use App\Http\Request;
use App\Util\Time;

sendSecurityHeaders();
header('Cache-Control: no-store');

$req = new Request();
if ($req->method() !== 'GET' && $req->method() !== 'HEAD') {
    Json::methodNotAllowed();
}

$payload = [
    'meta' => [
        'generatedAt'    => Time::now(),
        'freshness'      => 'fresh',
        'staleSince'     => null,
        'instanceErrors' => (object) [],
    ],
    'instances' => [],
    'items'     => [],
];

// ETag is derived from the data (not the timestamp) so conditional requests work
// even though generatedAt changes every second.
$hashData = ['instances' => $payload['instances'], 'items' => $payload['items']];
$etag = '"' . substr(hash('sha256', (string) json_encode($hashData, JSON_THROW_ON_ERROR)), 0, 16) . '"';

if ($req->ifNoneMatch() === $etag) {
    Json::notModified();
}

Json::ok($payload, 200, ['ETag' => $etag]);
