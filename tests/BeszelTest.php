<?php
declare(strict_types=1);

use App\Providers\Beszel;

$systemsBody = (string) file_get_contents(__DIR__ . '/fixtures/beszel/systems.json');
$statsBody   = (string) file_get_contents(__DIR__ . '/fixtures/beszel/system_stats.json');
$detailsBody = (string) file_get_contents(__DIR__ . '/fixtures/beszel/system_details.json');
$authBody    = (string) json_encode(['token' => 'fake-token', 'record' => ['id' => 'x']]);

$mkRoutes = function (string $statsBody) use ($systemsBody, $detailsBody, $authBody): array {
    return [
        'auth-with-password'                       => ['body' => $authBody,    'status' => 200, 'headers' => []],
        '/api/collections/systems/records'         => ['body' => $systemsBody, 'status' => 200, 'headers' => []],
        '/api/collections/system_stats/records'    => ['body' => $statsBody,   'status' => 200, 'headers' => []],
        '/api/collections/system_details/records'  => ['body' => $detailsBody, 'status' => 200, 'headers' => []],
    ];
};

$cfg = ['url' => 'https://beszel.test', 'username' => 'u@x', 'password' => 'pw'];

// ── Discovery happy path ───────────────────────────────────────────────────
$p = new Beszel();
$p->fakeRoutes = $mkRoutes($statsBody);
$discovery = $p->discover($cfg);
$kinds = array_count_values(array_column($discovery, 'kind'));
check(($kinds['host'] ?? 0) === 9,           'happy: discovery contains 9 host nodes');
check(($kinds['interface'] ?? 0) >= 1,       'happy: discovery contains at least one NIC node');

// ── Fetch parent system ────────────────────────────────────────────────────
$p = new Beszel();
$p->fakeRoutes = $mkRoutes($statsBody);
$items = $p->fetch($cfg, ['j2dcfdrz1h8tjz5']);
check(count($items) === 1,                    'happy: one item returned for one id');
$it = $items[0];
check($it['itemId']      === 'j2dcfdrz1h8tjz5', 'happy: itemId preserved');
check($it['state']       === 'active',          'happy: status=up → state=active');
check($it['statusText']  === 'Operational',     'happy: statusText = Operational');
check($it['providerId']  === 'beszel',          'happy: providerId = beszel');
check(!array_key_exists('_providerSeverityHint', $it) || $it['_providerSeverityHint'] === null, 'happy: no down hint for status=up');

// Check expected elements present
$byKey = [];
foreach ($it['elements'] as $e) { $byKey[$e['key']] = $e; }
check(isset($byKey['cpu'])   && $byKey['cpu']['type']   === 'gauge',   'happy: cpu gauge present');
check(isset($byKey['mem'])   && $byKey['mem']['type']   === 'gauge',   'happy: mem gauge present');
check(isset($byKey['disk'])  && $byKey['disk']['type']  === 'gauge',   'happy: disk gauge present');
check(isset($byKey['net_rx']) && $byKey['net_rx']['type'] === 'counter','happy: net_rx counter present');
check(isset($byKey['net_tx']) && $byKey['net_tx']['type'] === 'counter','happy: net_tx counter present');
check(isset($byKey['info'])  && $byKey['info']['type']  === 'text',    'happy: info text element present');

$cpu = $byKey['cpu'];
check(is_float($cpu['value']) || is_int($cpu['value']), 'happy: cpu value numeric');
check(($cpu['history']['intervalSec'] ?? 0) === 60,      'happy: cpu history interval=60');
check(count($cpu['history']['values'] ?? []) > 1,        'happy: cpu history has multiple points');

// ── Fetch NIC sub-item ─────────────────────────────────────────────────────
$p = new Beszel();
$p->fakeRoutes = $mkRoutes($statsBody);
$nicItems = $p->fetch($cfg, ['j2dcfdrz1h8tjz5::nic::eth0']);
check(count($nicItems) === 1,                          'happy: NIC fetch yields one item');
$nic = $nicItems[0];
check($nic['displayName'] === 'eth0',                  'happy: NIC displayName = eth0');
$nicKeys = array_column($nic['elements'], 'key');
check(in_array('net_rx', $nicKeys, true),              'happy: NIC has net_rx');
check(in_array('net_tx', $nicKeys, true),              'happy: NIC has net_tx');

// ── Corrupt stats: missing cpu key, mangled b ──────────────────────────────
$p = new Beszel();
$p->fakeRoutes = $mkRoutes((string) file_get_contents(__DIR__ . '/fixtures/beszel/system_stats_corrupt.json'));
$itemsC = $p->fetch($cfg, ['j2dcfdrz1h8tjz5']);
check(count($itemsC) === 1,                            'corrupt: still returns the item');
$itC = $itemsC[0];
$byKeyC = [];
foreach ($itC['elements'] as $e) { $byKeyC[$e['key']] = $e; }
check(!isset($byKeyC['cpu']),                          'corrupt: missing cpu key → cpu element skipped');
check(isset($byKeyC['mem']),                           'corrupt: mem element still present');
check(isset($byKeyC['disk']),                          'corrupt: disk element still present');
check(!isset($byKeyC['net_rx']) && !isset($byKeyC['net_tx']), 'corrupt: mangled b → no net counters');
check($itC['state'] === 'active',                      'corrupt: state still active');

// NIC sub-item with mangled ni value: parser must not crash; just no elements.
$p = new Beszel();
$p->fakeRoutes = $mkRoutes((string) file_get_contents(__DIR__ . '/fixtures/beszel/system_stats_corrupt.json'));
$nicC = $p->fetch($cfg, ['j2dcfdrz1h8tjz5::nic::eth0']);
check(count($nicC) === 1,                              'corrupt: NIC item still returned');
check(count($nicC[0]['elements']) === 0,               'corrupt: NIC element list empty (no crash)');

// ── 401 → reauth-once-and-retry ────────────────────────────────────────────
$p = new Beszel();
// First systems call returns 401, next succeeds.
$call = 0;
$p->fakeRoutes = $mkRoutes($statsBody);
// Force a manual swap: mark systems route as 401 once, then succeed.
$p->fakeRoutes['/api/collections/systems/records'] = ['body' => '', 'status' => 401, 'headers' => []];
// (Full re-auth-on-401 path tested via integration; here we just confirm the parser
// raises a clean exception that the aggregator catches.)
$threw = false;
try {
    $p->fetch($cfg, ['j2dcfdrz1h8tjz5']);
} catch (\Throwable $e) {
    $threw = true;
}
check($threw, 'reauth: persistent 401 surfaces as exception (Aggregator handles)');
