<?php
declare(strict_types=1);

use App\State\Evaluator;

$ev = new Evaluator();

// Helper: build a minimal item with one gauge element.
function gaugeItem(string $key, float $value, string $state = 'active'): array
{
    return [
        'instanceId'  => 'i1',
        'providerId'  => 'test',
        'itemId'      => 'x',
        'displayName' => 'X',
        'state'       => $state,
        'severity'    => 'ok',
        'statusText'  => null,
        'lastSeenAt'  => 0,
        'elements'    => [
            ['type' => 'gauge', 'key' => $key, 'label' => $key, 'value' => $value, 'unit' => '%'],
        ],
        'error'       => null,
    ];
}

$ok = $ev->evaluate(gaugeItem('cpu', 50));
check($ok['severity'] === 'ok',                    'cpu 50% → ok');
check($ok['statusText'] === 'Operational',         'cpu 50% statusText = Operational');
check(array_key_exists('severity', $ok['elements'][0]) && $ok['elements'][0]['severity'] === null, 'cpu 50% element severity = null');

$deg = $ev->evaluate(gaugeItem('cpu', 90));
check($deg['severity'] === 'degraded',                'cpu 90% → degraded');
check($deg['elements'][0]['severity'] === 'warn',     'cpu 90% element severity = warn');

$down = $ev->evaluate(gaugeItem('cpu', 98));
check($down['severity'] === 'down',                   'cpu 98% → down');
check($down['elements'][0]['severity'] === 'crit',    'cpu 98% element severity = crit');

$paused = $ev->evaluate(gaugeItem('cpu', 99, 'paused'));
check($paused['severity'] === 'ok',                   'paused at 99% CPU → severity ok');
check($paused['statusText'] === 'Paused',             'paused → statusText = Paused');
check($paused['elements'][0]['severity'] === null,    'paused element severity wiped');

$unknown = $ev->evaluate(gaugeItem('cpu', 99, 'unknown'));
check($unknown['severity'] === 'ok',                  'unknown at 99% CPU → severity ok');
check($unknown['statusText'] === 'Unknown',           'unknown → statusText = Unknown');

// Worst-of: warn on cpu + crit on disk → down.
$worst = $ev->evaluate([
    'instanceId' => 'i1', 'providerId' => 't', 'itemId' => 'y', 'displayName' => 'Y',
    'state' => 'active', 'severity' => 'ok', 'lastSeenAt' => 0, 'error' => null,
    'elements' => [
        ['type' => 'gauge', 'key' => 'cpu',  'label' => 'cpu',  'value' => 85, 'unit' => '%'],
        ['type' => 'gauge', 'key' => 'disk', 'label' => 'disk', 'value' => 99, 'unit' => '%'],
    ],
]);
check($worst['severity'] === 'down',                   'worst-of mixed warn+crit → down');

// Disk thresholds: 80 is below the disk warn threshold of 85.
$diskOk = $ev->evaluate(gaugeItem('disk', 80));
check($diskOk['severity'] === 'ok',                    'disk 80% under disk warn threshold (85) → ok');
$diskWarn = $ev->evaluate(gaugeItem('disk', 90));
check($diskWarn['severity'] === 'degraded',            'disk 90% → degraded');

// Counters: response_time
$rtOk = $ev->evaluate([
    'instanceId' => 'i', 'providerId' => 't', 'itemId' => 'rt', 'displayName' => 'RT',
    'state' => 'active', 'severity' => 'ok', 'lastSeenAt' => 0, 'error' => null,
    'elements' => [['type' => 'counter', 'key' => 'response_time', 'label' => 'rt', 'value' => 200, 'unit' => 'ms']],
]);
check($rtOk['severity'] === 'ok',                      'response_time 200ms → ok');
$rtDown = $ev->evaluate([
    'instanceId' => 'i', 'providerId' => 't', 'itemId' => 'rt', 'displayName' => 'RT',
    'state' => 'active', 'severity' => 'ok', 'lastSeenAt' => 0, 'error' => null,
    'elements' => [['type' => 'counter', 'key' => 'response_time', 'label' => 'rt', 'value' => 6000, 'unit' => 'ms']],
]);
check($rtDown['severity'] === 'down',                  'response_time 6000ms → down');

// Uptime windows — severity ONLY when element opts in via explicit thresholds.
$upNoThresh = $ev->evaluate([
    'instanceId' => 'i', 'providerId' => 't', 'itemId' => 'u', 'displayName' => 'U',
    'state' => 'active', 'severity' => 'ok', 'lastSeenAt' => 0, 'error' => null,
    'elements' => [['type' => 'uptime', 'key' => 'uptime', 'windows' => [
        ['label' => '7d', 'ratio' => 50.0], // would be very-bad if evaluated
    ]]],
]);
check($upNoThresh['severity'] === 'ok',                'uptime without explicit thresholds → never affects severity');

$upOk = $ev->evaluate([
    'instanceId' => 'i', 'providerId' => 't', 'itemId' => 'u', 'displayName' => 'U',
    'state' => 'active', 'severity' => 'ok', 'lastSeenAt' => 0, 'error' => null,
    'elements' => [['type' => 'uptime', 'key' => 'uptime', 'thresholds' => ['warn' => 99.0, 'crit' => 95.0], 'windows' => [
        ['label' => '24h', 'ratio' => 100.0],
        ['label' => '7d',  'ratio' => 99.95],
    ]]],
]);
check($upOk['severity'] === 'ok',                      'uptime opt-in: windows all ≥ 99 → ok');
$upDeg = $ev->evaluate([
    'instanceId' => 'i', 'providerId' => 't', 'itemId' => 'u', 'displayName' => 'U',
    'state' => 'active', 'severity' => 'ok', 'lastSeenAt' => 0, 'error' => null,
    'elements' => [['type' => 'uptime', 'key' => 'uptime', 'thresholds' => ['warn' => 99.0, 'crit' => 95.0], 'windows' => [
        ['label' => '7d', 'ratio' => 98.5],
    ]]],
]);
check($upDeg['severity'] === 'degraded',               'uptime opt-in: 98.5% → degraded');

// Provider hint: state=active but provider says down (Beszel host status=down).
$hint = $ev->evaluate([
    'instanceId' => 'i', 'providerId' => 't', 'itemId' => 'h', 'displayName' => 'H',
    'state' => 'active', 'severity' => 'ok', 'lastSeenAt' => 0, 'error' => null,
    'elements' => [['type' => 'gauge', 'key' => 'cpu', 'label' => 'cpu', 'value' => 5, 'unit' => '%']],
    '_providerSeverityHint' => 'down',
]);
check($hint['severity'] === 'down',                    'provider hint forces down even with healthy elements');
check(!array_key_exists('_providerSeverityHint', $hint), 'hint key stripped from output');
