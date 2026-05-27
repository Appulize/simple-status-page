<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

use App\Http\Json;
use App\Util\Time;

sendSecurityHeaders();
header('Cache-Control: no-store');

// Process-start sentinel: a file whose mtime is the first time the app
// answered /api/health after deploy. FPM-friendly (no process-wide globals).
$sentinel = SSP_DATA_ROOT . '/cache/started_at';
$startedAt = @filemtime($sentinel);
if ($startedAt === false) {
    @touch($sentinel);
    $startedAt = Time::now();
}

Json::ok([
    'ok'        => true,
    'time'      => Time::now(),
    'version'   => APP_VERSION,
    'uptimeSec' => max(0, Time::now() - $startedAt),
]);
