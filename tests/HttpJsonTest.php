<?php
declare(strict_types=1);

// Json::ok() calls exit, so we test the payload shapes directly via json_encode round-trips.

$statePayload = [
    'meta' => [
        'generatedAt'    => 1716700000,
        'freshness'      => 'fresh',
        'staleSince'     => null,
        'instanceErrors' => (object) [],
    ],
    'instances' => [],
    'items'     => [],
];

$d = json_decode((string) json_encode($statePayload, JSON_THROW_ON_ERROR), true, 16, JSON_THROW_ON_ERROR);
check($d['meta']['freshness'] === 'fresh',  'state: meta.freshness round-trips');
check($d['meta']['staleSince'] === null,    'state: meta.staleSince is null');
check($d['meta']['generatedAt'] === 1716700000, 'state: meta.generatedAt round-trips');
check(is_array($d['instances']),            'state: instances is array');
check(is_array($d['items']),                'state: items is array');

$configPayload = [
    'siteTitle'          => 'Test Page',
    'refreshIntervalSec' => 30,
    'appearance'         => [
        'theme'      => 'auto',
        'accent'     => 'mint',
        'cardstyle'  => 'paper',
        'mark'       => 'stripe',
        'density'    => 'regular',
        'mode'       => 'detailed',
        'sparklines' => true,
        'summaryBar' => true,
    ],
    'firstRun' => false,
];

$d = json_decode((string) json_encode($configPayload, JSON_THROW_ON_ERROR), true, 16, JSON_THROW_ON_ERROR);
check($d['siteTitle'] === 'Test Page',         'config: siteTitle round-trips');
check($d['refreshIntervalSec'] === 30,         'config: refreshIntervalSec round-trips');
check($d['appearance']['theme'] === 'auto',    'config: appearance.theme round-trips');
check($d['appearance']['sparklines'] === true, 'config: sparklines is bool true');
check($d['firstRun'] === false,                'config: firstRun is bool false');
