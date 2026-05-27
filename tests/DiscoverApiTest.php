<?php
declare(strict_types=1);

use App\Providers\Registry;

// ── Registry lists known providers ───────────────────────────────────────────
$all = Registry::all();
check(isset($all['beszel']),      'registry: beszel registered');
check(isset($all['uptimerobot']), 'registry: uptimerobot registered');

// ── Each provider exposes the metadata /api/providers needs ──────────────────
foreach ($all as $id => $cls) {
    check(is_string($cls::id())  && $cls::id()  !== '',   "registry/$id: id() non-empty");
    check(is_string($cls::name()) && $cls::name() !== '', "registry/$id: name() non-empty");
    check(is_int($cls::version()) && $cls::version() >= 1, "registry/$id: version() >=1");
    $schema = $cls::configSchema();
    check(is_array($schema) && $schema !== [],            "registry/$id: configSchema not empty");
    foreach ($schema as $f) {
        check(isset($f['key'], $f['label'], $f['type']),  "registry/$id: schema field has key/label/type");
    }
}

// ── validate() rejects empty / malformed configs (no upstream contact) ───────
$beszel = new App\Providers\Beszel();
$r = $beszel->validate([]);
check($r['ok'] === false,                       'beszel.validate({}) → not ok');
check(count($r['errors']) >= 3,                 'beszel.validate({}) reports each missing required field');

$r = $beszel->validate(['url' => 'not-a-url', 'username' => 'a', 'password' => 'b']);
check($r['ok'] === false,                       'beszel.validate(bad-url) → not ok');

$r = $beszel->validate(['url' => 'https://hub.example', 'username' => 'a@b.c', 'password' => 'p']);
check($r['ok'] === true,                        'beszel.validate(valid shape) → ok');

$ur = new App\Providers\UptimeRobot();
$r  = $ur->validate(['apiKey' => '']);
check($r['ok'] === false,                       'uptimerobot.validate(empty key) → not ok');
$r  = $ur->validate(['apiKey' => 'ur1234567-abcdef0123456789']);
check($r['ok'] === true,                        'uptimerobot.validate(plausible key) → ok');

// ── Unknown provider id throws ───────────────────────────────────────────────
$threw = false;
try { Registry::get('does-not-exist'); } catch (\InvalidArgumentException) { $threw = true; }
check($threw, 'registry.get(unknown) throws InvalidArgumentException');
