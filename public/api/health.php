<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/src/bootstrap.php';

use App\Http\Json;
use App\Util\Time;

sendSecurityHeaders();

Json::ok(['ok' => true, 'time' => Time::now()]);
