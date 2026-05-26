<?php
declare(strict_types=1);

namespace App\Config;

class Migrations
{
    public static function run(array $data): array
    {
        if (!isset($data['schemaVersion'])) {
            $data['schemaVersion'] = 1;
        }
        return $data;
    }
}
