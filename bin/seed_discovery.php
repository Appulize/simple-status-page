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

    // Preserve any existing visibility / displayName overrides by id.
    $existing = [];
    foreach (($inst['items'] ?? []) as $row) {
        if (isset($row['id'])) {
            $existing[(string) $row['id']] = $row;
        }
    }

    $items = [];
    $seen  = [];
    foreach ($nodes as $n) {
        $id      = (string) ($n['id'] ?? '');
        $label   = (string) ($n['label'] ?? '');
        $isChild = ($n['parentId'] ?? null) !== null;
        $prior   = $existing[$id] ?? null;
        $items[] = [
            'id'          => $id,
            // Children (network interfaces, disks, …) default to hidden so the
            // grid stays focused on top-level hosts. Admin opts them in via
            // the Catalog tab. Existing overrides are preserved.
            'visible'     => $prior['visible']     ?? !$isChild,
            // Cache the upstream label so disappeared items still render with
            // a friendly name. Admin overrides win.
            'displayName' => $prior['displayName'] ?? ($label !== '' ? $label : null),
        ];
        $seen[$id] = true;
    }
    // Preserve orphans: items previously discovered that upstream no longer
    // returns. The Aggregator will surface them with a 'missing from upstream'
    // placeholder; admin removes them by unchecking in the Catalog tab.
    foreach ($existing as $id => $row) {
        if (!isset($seen[$id])) {
            $items[] = $row;
        }
    }
    $settings['instances'][$i]['items'] = $items;
}

Store::write($settings);
echo "wrote " . dirname(__DIR__) . "/config/settings.json\n";
