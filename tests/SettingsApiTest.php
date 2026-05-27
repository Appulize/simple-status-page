<?php
declare(strict_types=1);

use App\Config\SettingsValidator;
use App\Config\Store;

function ssp_baseCfg(): array
{
    $cfg = Store::defaults();
    $cfg['auth']['passwordHash'] = '$2y$12$serversidehash';
    return $cfg;
}

// ── Store::mtime() ───────────────────────────────────────────────────────────
$p = sys_get_temp_dir() . '/ssp_mtime_' . bin2hex(random_bytes(4)) . '.json';
Store::init($p);
check(Store::mtime() === 0, 'mtime: 0 for missing file');

$d = Store::defaults();
Store::write($d);
$m1 = Store::mtime();
check($m1 > 0, 'mtime: non-zero after write');
@unlink($p);

// ── Required keys ────────────────────────────────────────────────────────────
$cur = ssp_baseCfg();
$incoming = $cur;
unset($incoming['instances']);
$r = SettingsValidator::validate($incoming, $cur);
check($r['ok'] === false && $r['status'] === 400, 'validator: missing instances → 400');
check(str_contains((string) $r['error'], 'instances'), 'validator: error mentions field name');

// ── Schema version + passwordHash forcibly preserved ─────────────────────────
$incoming = ssp_baseCfg();
$incoming['schemaVersion'] = 999;
$incoming['auth']['passwordHash'] = 'tampered';
$r = SettingsValidator::validate($incoming, $cur);
check($r['ok'] === true,                              'validator: ok when required keys present');
check($r['merged']['schemaVersion'] === 1,            'validator: schemaVersion preserved from server');
check($r['merged']['auth']['passwordHash'] === '$2y$12$serversidehash',
    'validator: passwordHash preserved from server');

// ── Lockout guard ────────────────────────────────────────────────────────────
$incoming = ssp_baseCfg();
foreach (['form', 'basic', 'token', 'clientCert'] as $m) {
    $incoming['auth']['methods'][$m]['enabled'] = false;
}
$r = SettingsValidator::validate($incoming, $cur);
check($r['ok'] === false && $r['status'] === 400, 'validator: all-disabled → 400');
check(str_contains((string) $r['error'], 'method'),  'validator: lockout error mentions method');

// ── Token preservation when enabled but empty in payload ─────────────────────
$cur2 = ssp_baseCfg();
$cur2['auth']['methods']['token'] = ['enabled' => true, 'token' => 'priortoken'];
$incoming = $cur2;
$incoming['auth']['methods']['token'] = ['enabled' => true, 'token' => ''];
$r = SettingsValidator::validate($incoming, $cur2);
check($r['ok'] === true, 'validator: token enabled w/ empty payload value is ok');
check($r['merged']['auth']['methods']['token']['token'] === 'priortoken',
    'validator: empty token payload preserves prior token');

// ── Token rotation accepted when value supplied ──────────────────────────────
$incoming = $cur2;
$incoming['auth']['methods']['token'] = ['enabled' => true, 'token' => 'newtoken'];
$r = SettingsValidator::validate($incoming, $cur2);
check($r['ok'] === true, 'validator: token rotation accepted');
check($r['merged']['auth']['methods']['token']['token'] === 'newtoken',
    'validator: new token value preserved');
