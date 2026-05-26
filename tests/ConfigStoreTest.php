<?php
declare(strict_types=1);

use App\Config\Store;

function tmpPath(): string
{
    return sys_get_temp_dir() . '/ssp_test_' . bin2hex(random_bytes(4)) . '.json';
}

// ── Read on missing file returns default skeleton ────────────────────────────
$p = tmpPath();
Store::init($p);
$data = Store::read();
check(!file_exists($p),                          'missing file: read() does not create file');
check(isset($data['schemaVersion']),             'missing file: returns schemaVersion');
check(array_key_exists('passwordHash', $data['auth'] ?? []), 'missing file: returns auth.passwordHash key');
check(isset($data['ui']),                        'missing file: returns ui');
check(is_array($data['instances']),              'missing file: instances is array');

// ── Written settings survive round-trip read ─────────────────────────────────
$p = tmpPath();
Store::init($p);
$write = Store::defaults();
$write['ui']['siteTitle'] = 'Round Trip Test';
Store::write($write);
Store::init($p); // reset lastKnown so read() hits the file
$back = Store::read();
check($back['ui']['siteTitle'] === 'Round Trip Test', 'round-trip: siteTitle preserved');
check($back['schemaVersion'] === 1,                   'round-trip: schemaVersion preserved');
@unlink($p);

// ── Corrupt JSON returns default, does not throw ──────────────────────────────
$p = tmpPath();
Store::init($p);
file_put_contents($p, '{not valid json,,}');
$result = null;
$threw  = false;
try {
    $result = Store::read();
} catch (\Throwable) {
    $threw = true;
}
check(!$threw,                     'corrupt JSON: no exception thrown');
check(is_array($result),           'corrupt JSON: returned array');
check(isset($result['schemaVersion']), 'corrupt JSON: returned default skeleton');
@unlink($p);

// ── isFirstRun() true when file missing ──────────────────────────────────────
$p = tmpPath();
Store::init($p);
check(Store::isFirstRun(), 'isFirstRun: true when file missing');

// ── isFirstRun() true when passwordHash is empty string ──────────────────────
$p = tmpPath();
Store::init($p);
$d = Store::defaults();
$d['auth']['passwordHash'] = '';
Store::write($d);
Store::init($p);
check(Store::isFirstRun(), 'isFirstRun: true when passwordHash is ""');
@unlink($p);

// ── isFirstRun() false when passwordHash is non-empty ────────────────────────
$p = tmpPath();
Store::init($p);
$d = Store::defaults();
$d['auth']['passwordHash'] = '$2y$12$fakehashfortest';
Store::write($d);
Store::init($p);
check(!Store::isFirstRun(), 'isFirstRun: false when passwordHash is non-empty');
@unlink($p);

// ── defaults() returns all required keys ─────────────────────────────────────
$def = Store::defaults();
check(isset($def['schemaVersion']),                        'defaults: schemaVersion');
check(array_key_exists('passwordHash', $def['auth']),      'defaults: auth.passwordHash key');
check(isset($def['auth']['methods']['form']),               'defaults: auth.methods.form');
check(array_key_exists('siteTitle', $def['ui']),           'defaults: ui.siteTitle key');
check(isset($def['ui']['refreshIntervalSec']),              'defaults: ui.refreshIntervalSec');
check(array_key_exists('instances', $def),                 'defaults: instances key');
check(array_key_exists('displayOrder', $def),              'defaults: displayOrder key');
check(array_key_exists('itemConfig', $def),                'defaults: itemConfig key');
