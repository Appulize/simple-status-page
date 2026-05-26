<?php
declare(strict_types=1);

/**
 * One-off helper: run discover() on each configured instance and write the
 * resulting items into settings.json. Used during Sprint 5 verification before
 * the proper Settings API + UI lands in Sprint 6.
 */

require_once dirname(__DIR__) . '/src/bootstrap.php';

use App\Config\Store;
use App\Providers\Registry;

$settings = Store::read();
$instances = $settings['instances'] ?? [];

foreach ($instances as $i => $inst) {
    $providerId = $inst['provider'] ?? '';
    $instId     = $inst['id'] ?? '?';
    if ($providerId === '') {
        echo "skip $instId: no provider\n";
        continue;
    }
    try {
        $cls = Registry::get($providerId);
        $p = new $cls();
        $nodes = $p->discover($inst['config'] ?? []);
    } catch (\Throwable $e) {
        echo "FAIL $instId ($providerId): " . $e->getMessage() . "\n";
        continue;
    }
    echo "OK   $instId ($providerId): " . count($nodes) . " nodes\n";

    $items = [];
    foreach ($nodes as $n) {
        $items[] = [
            'id'          => (string) ($n['id'] ?? ''),
            'visible'     => true,
            'displayName' => null,
        ];
    }
    $settings['instances'][$i]['items'] = $items;
}

Store::write($settings);
echo "wrote " . dirname(__DIR__) . "/config/settings.json\n";
