<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

use App\Config\Store;
use App\Http\Json;
use App\State\Cache;
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

$cachedAt = (new Cache())->cachedAt();
$cacheAgeSec = $cachedAt === null ? null : max(0, Time::now() - $cachedAt);
$schemaVersion = (int) (Store::read()['schemaVersion'] ?? 1);

Json::ok([
    'ok'            => true,
    'time'          => Time::now(),
    'version'       => APP_VERSION,
    'uptimeSec'     => max(0, Time::now() - $startedAt),
    'schemaVersion' => $schemaVersion,
    'cacheAgeSec'   => $cacheAgeSec,
]);
