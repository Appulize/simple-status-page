<?php
declare(strict_types=1);

/**
 * Background state regeneration worker. Spawned by Aggregator::spawnBackgroundRegen()
 * when a request hits an expired cache; lets the foreground response serve stale
 * data while this worker refreshes it for the next request.
 */

require_once dirname(__DIR__) . '/src/bootstrap.php';

use App\State\Aggregator;

(new Aggregator())->regenerateNow();
