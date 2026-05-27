<?php
declare(strict_types=1);

use App\Config\Store;
use App\Providers\Registry;
use App\State\Aggregator;
use App\State\Backoff;
use App\State\Cache;

require_once __DIR__ . '/fixtures/FakeProvider.php';

Registry::register('fake', Tests\Fixtures\FakeProvider::class);

function ssp_aggTmpDir(): string
{
    $d = sys_get_temp_dir() . '/ssp_agg_' . bin2hex(random_bytes(4));
    mkdir($d, 0700, true);
    mkdir($d . '/cache', 0700, true);
    mkdir($d . '/config', 0700, true);
    return $d;
}

function ssp_aggMkAggregator(string $tmp): Aggregator
{
    return new Aggregator(
        new Cache($tmp . '/cache/state.json'),
        new Backoff($tmp . '/cache/backoff.json'),
        null,
        $tmp . '/cache/state.json.lock'
    );
}

function ssp_aggBaseSettings(): array
{
    return [
        'schemaVersion' => 1,
        'auth' => ['passwordHash' => '$2y$12$x', 'methods' => ['form' => ['enabled' => true]]],
        'ui'   => ['refreshIntervalSec' => 30, 'siteTitle' => null],
        'instances' => [[
            'id'       => 'inst1',
            'provider' => 'fake',
            'config'   => [],
            'items'    => [
                ['id' => 'a', 'visible' => true,  'displayName' => 'Alpha'],
                ['id' => 'b', 'visible' => true,  'displayName' => 'Bravo'],
                ['id' => 'c', 'visible' => false, 'displayName' => 'Charlie'],
            ],
        ]],
        'displayOrder' => [],
        'itemConfig'   => [],
    ];
}

function ssp_aggFetchOk(): array
{
    return [
        [
            'instanceId'  => 'inst1',
            'providerId'  => 'fake',
            'itemId'      => 'a',
            'displayName' => 'Alpha',
            'state'       => 'active',
            'severity'    => 'ok',
            'lastSeenAt'  => 0,
            'elements'    => [
                ['type' => 'gauge', 'key' => 'cpu', 'label' => 'cpu', 'value' => 10, 'unit' => '%',
                 'thresholds' => ['warn' => 80, 'crit' => 95]],
            ],
            'error'       => null,
        ],
        [
            'instanceId'  => 'inst1',
            'providerId'  => 'fake',
            'itemId'      => 'b',
            'displayName' => 'Bravo',
            'state'       => 'active',
            'severity'    => 'ok',
            'lastSeenAt'  => 0,
            'elements'    => [
                ['type' => 'gauge', 'key' => 'cpu', 'label' => 'cpu', 'value' => 50, 'unit' => '%',
                 'thresholds' => ['warn' => 80, 'crit' => 95]],
            ],
            'error'       => null,
        ],
    ];
}

// ── 1. Fresh regen from empty cache ──────────────────────────────────────────
$tmp = ssp_aggTmpDir();
Store::init($tmp . '/config/settings.json');
Store::write(ssp_aggBaseSettings());
Tests\Fixtures\FakeProvider::reset();
Tests\Fixtures\FakeProvider::$nextFetch = ssp_aggFetchOk();

$agg = ssp_aggMkAggregator($tmp);
$payload = $agg->get();

check(count($payload['items']) === 2,                       'empty cache: 2 visible items returned');
check($payload['items'][0]['itemId']  === 'a',              'empty cache: first item is a');
check($payload['items'][0]['severity'] === 'ok',            'empty cache: evaluator stamped severity ok');
check($payload['meta']['freshness'] === 'fresh',            'empty cache: freshness=fresh');
check(isset($payload['meta']['etag']) && $payload['meta']['etag'] !== '', 'empty cache: etag present');
check(file_exists($tmp . '/cache/state.json'),              'empty cache: state.json written');

// ── 2. Cache returns fresh on next call without re-fetching ──────────────────
Tests\Fixtures\FakeProvider::$nextFetch = []; // would yield 0 items if provider were re-called
$payload2 = $agg->get();
check(count($payload2['items']) === 2, 'fresh cache: items reused, provider not called');

// ── 3. Provider failure → instanceErrors populated, error items returned ─────
$tmp = ssp_aggTmpDir();
Store::init($tmp . '/config/settings.json');
Store::write(ssp_aggBaseSettings());
Tests\Fixtures\FakeProvider::reset();
Tests\Fixtures\FakeProvider::$throwOnFetch = 'connection refused';
$agg = ssp_aggMkAggregator($tmp);
$payload = $agg->get();

check(count($payload['items']) === 2,                       'provider error: still 2 placeholder items');
check($payload['items'][0]['state'] === 'unknown',          'provider error: item state=unknown');
check($payload['items'][0]['error'] === 'connection refused', 'provider error: error message propagated');
$errs = $payload['meta']['instanceErrors'];
$errsArr = is_array($errs) ? $errs : (array) $errs;
check(($errsArr['inst1'] ?? null) === 'connection refused', 'provider error: instanceErrors stamped');

// ── 4. Missing-from-upstream item → synthesized unknown placeholder ──────────
$tmp = ssp_aggTmpDir();
Store::init($tmp . '/config/settings.json');
Store::write(ssp_aggBaseSettings());
Tests\Fixtures\FakeProvider::reset();
$only_a = [ssp_aggFetchOk()[0]]; // only 'a' returned; 'b' is configured visible but absent
Tests\Fixtures\FakeProvider::$nextFetch = $only_a;
$agg = ssp_aggMkAggregator($tmp);
$payload = $agg->get();

$ids = array_column($payload['items'], 'itemId');
sort($ids);
check($ids === ['a', 'b'],                                'missing item: still 2 items (1 real, 1 synthesized)');
$bRow = null;
foreach ($payload['items'] as $it) {
    if ($it['itemId'] === 'b') { $bRow = $it; break; }
}
check($bRow !== null && $bRow['state'] === 'unknown',     'missing item: synthesized item has state=unknown');
check($bRow['error'] === 'Item missing from upstream',     'missing item: error message');

// ── 5. displayOrder ranks items per order, unknown keys appended ─────────────
$tmp = ssp_aggTmpDir();
$settings = ssp_aggBaseSettings();
$settings['displayOrder'] = [
    ['instanceId' => 'inst1', 'itemId' => 'b'], // b first
    ['instanceId' => 'inst1', 'itemId' => 'a'], // a second
];
Store::init($tmp . '/config/settings.json');
Store::write($settings);
Tests\Fixtures\FakeProvider::reset();
Tests\Fixtures\FakeProvider::$nextFetch = ssp_aggFetchOk();
$agg = ssp_aggMkAggregator($tmp);
$payload = $agg->get();

check($payload['items'][0]['itemId'] === 'b',              'displayOrder: b ranked first');
check($payload['items'][1]['itemId'] === 'a',              'displayOrder: a ranked second');

// ── 6. Threshold overrides via itemConfig.thresholdOverrides ────────────────
$tmp = ssp_aggTmpDir();
$settings = ssp_aggBaseSettings();
$settings['itemConfig'] = [
    'inst1:a' => [
        'thresholdOverrides' => [
            'cpu' => ['warn' => 5, 'crit' => 8],
        ],
    ],
];
Store::init($tmp . '/config/settings.json');
Store::write($settings);
Tests\Fixtures\FakeProvider::reset();
Tests\Fixtures\FakeProvider::$nextFetch = ssp_aggFetchOk();
$agg = ssp_aggMkAggregator($tmp);
$payload = $agg->get();

$aRow = null;
foreach ($payload['items'] as $it) {
    if ($it['itemId'] === 'a') { $aRow = $it; break; }
}
check($aRow !== null,                                      'threshold override: item a present');
check($aRow['elements'][0]['thresholds']['warn'] === 5.0,  'threshold override: warn merged into element');
check($aRow['elements'][0]['thresholds']['crit'] === 8.0,  'threshold override: crit merged into element');
// 'a' has cpu=10, override warn=5/crit=8 → severity should flip to down (was ok)
check($aRow['severity'] === 'down',                        'threshold override: severity recomputed via evaluator');

// ── 7. applyUserTransforms fast-path returns null when threshold overrides exist
$ref = new \ReflectionClass(Aggregator::class);
$method = $ref->getMethod('applyUserTransforms');
$method->setAccessible(true);
$agg = new Aggregator();
$cached = [
    ['instanceId' => 'inst1', 'itemId' => 'a', 'displayName' => 'Alpha', 'elements' => []],
];
$settingsWithOverride = ssp_aggBaseSettings();
$settingsWithOverride['itemConfig'] = [
    'inst1:a' => ['thresholdOverrides' => ['cpu' => ['warn' => 5]]],
];
$result = $method->invoke($agg, $cached, $settingsWithOverride);
check($result === null, 'fast-path: returns null when any item has thresholdOverrides');

// ── 8. applyUserTransforms returns null when newly-visible item missing ─────
$cached = [
    ['instanceId' => 'inst1', 'itemId' => 'a', 'displayName' => 'Alpha', 'elements' => []],
    // 'b' is visible per settings but not in cache
];
$result = $method->invoke($agg, $cached, ssp_aggBaseSettings());
check($result === null, 'fast-path: returns null when newly-visible item missing from cache');

// ── 9. applyUserTransforms succeeds when cache covers all visible items ─────
$cached = [
    ['instanceId' => 'inst1', 'itemId' => 'a', 'displayName' => 'Alpha', 'elements' => []],
    ['instanceId' => 'inst1', 'itemId' => 'b', 'displayName' => 'Bravo', 'elements' => []],
    ['instanceId' => 'inst1', 'itemId' => 'orphan', 'displayName' => 'Old', 'elements' => []],
];
$result = $method->invoke($agg, $cached, ssp_aggBaseSettings());
check(is_array($result) && count($result['items']) === 2, 'fast-path: returns 2 visible items, orphan filtered');
check(isset($result['etag']) && $result['etag'] !== '',   'fast-path: etag computed');
