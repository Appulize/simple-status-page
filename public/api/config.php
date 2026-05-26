<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

use App\Config\Store;
use App\Http\Json;
use App\Http\Request;

sendSecurityHeaders();
header('Cache-Control: public, max-age=30');

$req = new Request();
if ($req->method() !== 'GET' && $req->method() !== 'HEAD') {
    Json::methodNotAllowed();
}

$cfg = Store::read();
$ui  = $cfg['ui'] ?? [];

$siteTitle = $ui['siteTitle'] ?? null;
if (!is_string($siteTitle) || $siteTitle === '') {
    $siteTitle = $req->host();
}

Json::ok([
    'siteTitle'          => $siteTitle,
    'refreshIntervalSec' => (int) ($ui['refreshIntervalSec'] ?? 30),
    'appearance'         => [
        'theme'      => $ui['theme']      ?? 'auto',
        'accent'     => $ui['accent']     ?? 'mint',
        'cardstyle'  => $ui['cardstyle']  ?? 'paper',
        'mark'       => $ui['mark']       ?? 'stripe',
        'density'    => $ui['density']    ?? 'regular',
        'mode'       => $ui['mode']       ?? 'detailed',
        'sparklines' => (bool) ($ui['sparklines'] ?? true),
        'summaryBar' => (bool) ($ui['summaryBar'] ?? true),
    ],
    'firstRun' => Store::isFirstRun(),
]);
