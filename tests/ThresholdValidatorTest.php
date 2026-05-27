<?php
declare(strict_types=1);

use App\Config\ThresholdValidator;

// ── Empty itemConfig passes through ─────────────────────────────────────────
$r = ThresholdValidator::validate([]);
check($r['ok'] === true && $r['cleaned'] === [], 'threshold: empty itemConfig ok');

// ── Entry without thresholdOverrides is left untouched ──────────────────────
$in = ['instA:item1' => ['displayName' => 'Foo']];
$r  = ThresholdValidator::validate($in);
check($r['ok'] === true, 'threshold: entry without overrides ok');
check($r['cleaned'] === $in, 'threshold: untouched entry preserved verbatim');

// ── Empty thresholdOverrides object is dropped ──────────────────────────────
$r = ThresholdValidator::validate(['instA:item1' => ['displayName' => 'X', 'thresholdOverrides' => []]]);
check($r['ok'] === true, 'threshold: empty overrides ok');
check(!isset($r['cleaned']['instA:item1']['thresholdOverrides']), 'threshold: empty overrides stripped');

// ── Valid cpu override ──────────────────────────────────────────────────────
$r = ThresholdValidator::validate(['i:1' => ['thresholdOverrides' => ['cpu' => ['warn' => 50, 'crit' => 80]]]]);
check($r['ok'] === true, 'threshold: cpu warn=50 crit=80 ok');
check($r['cleaned']['i:1']['thresholdOverrides']['cpu'] === ['warn' => 50.0, 'crit' => 80.0],
    'threshold: cpu values cast to float');

// ── String-numeric coerces ──────────────────────────────────────────────────
$r = ThresholdValidator::validate(['i:1' => ['thresholdOverrides' => ['mem' => ['warn' => '70', 'crit' => '90']]]]);
check($r['ok'] === true, 'threshold: string-numeric accepted');
check($r['cleaned']['i:1']['thresholdOverrides']['mem']['warn'] === 70.0, 'threshold: string "70" → 70.0');

// ── Non-numeric rejected ────────────────────────────────────────────────────
$r = ThresholdValidator::validate(['i:1' => ['thresholdOverrides' => ['cpu' => ['warn' => 'abc']]]]);
check($r['ok'] === false, 'threshold: non-numeric warn rejected');

// ── Out-of-range rejected (cpu > 100) ───────────────────────────────────────
$r = ThresholdValidator::validate(['i:1' => ['thresholdOverrides' => ['cpu' => ['warn' => 50, 'crit' => 150]]]]);
check($r['ok'] === false, 'threshold: cpu crit=150 rejected');

// ── Out-of-range rejected (response_time > 300000) ──────────────────────────
$r = ThresholdValidator::validate(['i:1' => ['thresholdOverrides' => ['response_time' => ['crit' => 400000]]]]);
check($r['ok'] === false, 'threshold: response_time crit=400000 rejected');

// ── response_time within bounds ─────────────────────────────────────────────
$r = ThresholdValidator::validate(['i:1' => ['thresholdOverrides' => ['response_time' => ['warn' => 500, 'crit' => 2000]]]]);
check($r['ok'] === true, 'threshold: response_time within bounds ok');

// ── warn > crit rejected for cpu ────────────────────────────────────────────
$r = ThresholdValidator::validate(['i:1' => ['thresholdOverrides' => ['cpu' => ['warn' => 90, 'crit' => 50]]]]);
check($r['ok'] === false, 'threshold: cpu warn>crit rejected');

// ── warn < crit rejected for uptime (lower is worse) ────────────────────────
$r = ThresholdValidator::validate(['i:1' => ['thresholdOverrides' => ['uptime_30d' => ['warn' => 90, 'crit' => 99]]]]);
check($r['ok'] === false, 'threshold: uptime warn<crit rejected');

// ── warn >= crit for uptime ok ──────────────────────────────────────────────
$r = ThresholdValidator::validate(['i:1' => ['thresholdOverrides' => ['uptime_30d' => ['warn' => 99, 'crit' => 95]]]]);
check($r['ok'] === true, 'threshold: uptime warn>=crit ok');

// ── Unknown element key rejected ────────────────────────────────────────────
$r = ThresholdValidator::validate(['i:1' => ['thresholdOverrides' => ['weird_key' => ['warn' => 1]]]]);
check($r['ok'] === false, 'threshold: unknown key rejected');

// ── Empty pair inside overrides is dropped ──────────────────────────────────
$r = ThresholdValidator::validate(['i:1' => ['thresholdOverrides' => ['cpu' => []]]]);
check($r['ok'] === true, 'threshold: empty pair ok');
check(!isset($r['cleaned']['i:1']['thresholdOverrides']), 'threshold: all-empty pairs collapse the overrides object');

// ── Null sides treated as "no override" ─────────────────────────────────────
$r = ThresholdValidator::validate(['i:1' => ['thresholdOverrides' => ['cpu' => ['warn' => 80, 'crit' => null]]]]);
check($r['ok'] === true, 'threshold: null crit ignored');
check($r['cleaned']['i:1']['thresholdOverrides']['cpu'] === ['warn' => 80.0],
    'threshold: only warn side persisted when crit is null');

// ── Plumbed through SettingsValidator ───────────────────────────────────────
use App\Config\SettingsValidator;
use App\Config\Store;

$cur = Store::defaults();
$cur['auth']['passwordHash'] = '$2y$12$hash';
$incoming = $cur;
$incoming['itemConfig'] = ['i:1' => ['thresholdOverrides' => ['cpu' => ['warn' => 60, 'crit' => 85]]]];
$r = SettingsValidator::validate($incoming, $cur);
check($r['ok'] === true, 'settings: valid thresholdOverrides accepted');
check($r['merged']['itemConfig']['i:1']['thresholdOverrides']['cpu']['warn'] === 60.0,
    'settings: cleaned overrides flow through');

$incoming['itemConfig'] = ['i:1' => ['thresholdOverrides' => ['cpu' => ['warn' => 99, 'crit' => 50]]]];
$r = SettingsValidator::validate($incoming, $cur);
check($r['ok'] === false && $r['status'] === 400, 'settings: bad thresholdOverrides → 400');
