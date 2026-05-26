<?php
declare(strict_types=1);

use App\Providers\UptimeRobot;
use App\State\HttpClient;

/**
 * Stub HTTP client that returns a captured fixture as the single page of monitors.
 */
final class FakeHttpClient extends HttpClient
{
    private string $body;
    public int $calls = 0;

    public function __construct(string $body)
    {
        $this->body = $body;
    }

    public function request(string $method, string $url, array $headers = [], ?string $body = null): array
    {
        $this->calls++;
        return ['body' => $this->body, 'status' => 200, 'headers' => []];
    }
}

// ── Happy path ──────────────────────────────────────────────────────────────
$fix = file_get_contents(__DIR__ . '/fixtures/uptimerobot/monitors.json');
$ur  = new UptimeRobot(new FakeHttpClient((string) $fix));

$fixJson = json_decode((string) $fix, true);
$allIds  = array_map(fn($m) => (string) $m['id'], $fixJson['monitors']);

$discovery = $ur->discover(['apiKey' => 'test']);
check(count($discovery) === count($allIds), 'happy: discovery node count matches fixture');
check(($discovery[0]['kind'] ?? '') === 'monitor', 'happy: discovery node kind = monitor');

$items = $ur->fetch(['apiKey' => 'test'], $allIds);
check(count($items) === count($allIds), 'happy: fetch item count matches selected ids');

// Find monitor with status=2 (up) and assert state=active
$up = null;
foreach ($items as $it) {
    foreach ($fixJson['monitors'] as $m) {
        if ((string) $m['id'] === $it['itemId'] && $m['status'] === 2) { $up = $it; break 2; }
    }
}
check($up !== null && $up['state'] === 'active', 'happy: status=2 → state=active');

// Find monitor with status=9 (down)
$down = null;
foreach ($items as $it) {
    foreach ($fixJson['monitors'] as $m) {
        if ((string) $m['id'] === $it['itemId'] && $m['status'] === 9) { $down = $it; break 2; }
    }
}
check($down !== null && $down['state'] === 'active' && $down['statusText'] === 'Down', 'happy: status=9 → state=active + Down text');

// Find monitor with status=0 (paused)
$paused = null;
foreach ($items as $it) {
    foreach ($fixJson['monitors'] as $m) {
        if ((string) $m['id'] === $it['itemId'] && $m['status'] === 0) { $paused = $it; break 2; }
    }
}
check($paused !== null && $paused['state'] === 'paused', 'happy: status=0 → state=paused');

// Element shape on a healthy monitor
$el = $up['elements'] ?? [];
$hasRt   = false;
$hasUp   = false;
$hasLink = false;
foreach ($el as $e) {
    if (($e['key'] ?? null) === 'response_time' && ($e['type'] ?? null) === 'counter') { $hasRt = true; }
    if (($e['key'] ?? null) === 'uptime'        && ($e['type'] ?? null) === 'uptime')  { $hasUp = true; }
    if (($e['key'] ?? null) === 'link'          && ($e['type'] ?? null) === 'link')    { $hasLink = true; }
}
check($hasRt,   'happy: response_time counter present');
check($hasUp,   'happy: uptime element present');
check($hasLink, 'happy: link element present');

// ── Corrupt fixture ─────────────────────────────────────────────────────────
$fix2 = file_get_contents(__DIR__ . '/fixtures/uptimerobot/monitors_corrupt.json');
$ur2  = new UptimeRobot(new FakeHttpClient((string) $fix2));
$fix2Json = json_decode((string) $fix2, true);
$ids2 = array_map(fn($m) => (string) $m['id'], $fix2Json['monitors']);

$items2 = $ur2->fetch(['apiKey' => 'test'], $ids2);
check(count($items2) === count($ids2), 'corrupt: every selected id still produces an item');

// status="nope" → unknown state, not a crash
$badStatus = null;
foreach ($items2 as $it) {
    foreach ($fix2Json['monitors'] as $m) {
        if ((string) $m['id'] === $it['itemId'] && ($m['status'] ?? null) === 'nope') {
            $badStatus = $it;
            break 2;
        }
    }
}
check($badStatus !== null && $badStatus['state'] === 'unknown', 'corrupt: non-numeric status → unknown');

// Minimal monitor (only id+friendly_name): elements may be empty but item exists with state unknown.
$minimal = null;
foreach ($items2 as $it) {
    if ($it['itemId'] === '999999999') { $minimal = $it; break; }
}
check($minimal !== null,                          'corrupt: minimal monitor item exists');
check($minimal['displayName'] === 'minimal',      'corrupt: minimal monitor name preserved');
check($minimal['state'] === 'unknown',            'corrupt: monitor with missing status → unknown');
