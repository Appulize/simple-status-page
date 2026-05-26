<?php
declare(strict_types=1);

namespace App\Providers;

use App\State\HttpClient;
use App\Util\Log;
use App\Util\Safe;

class UptimeRobot implements Provider
{
    private const ENDPOINT  = 'https://api.uptimerobot.com/v2/getMonitors';
    private const PAGE_SIZE = 50;

    private HttpClient $http;

    public function __construct(?HttpClient $http = null)
    {
        $this->http = $http ?? new HttpClient();
    }

    public static function id(): string
    {
        return 'uptimerobot';
    }

    public static function name(): string
    {
        return 'UptimeRobot';
    }

    public static function version(): int
    {
        return 1;
    }

    public static function configSchema(): array
    {
        return [
            [
                'key'      => 'apiKey',
                'label'    => 'API key',
                'type'     => 'secret',
                'required' => true,
                'help'     => 'A read-only API key (account dashboard → Settings → API). Main keys also work but are unnecessary.',
            ],
        ];
    }

    public function validate(array $config): array
    {
        $errors = [];
        $key = Safe::str(Safe::get($config, 'apiKey'));
        if ($key === '') {
            $errors[] = 'API key is required.';
        } elseif (!preg_match('/^[mu]?ur?\d+-[a-f0-9]+$/i', $key) && !preg_match('/^u\d+-[a-f0-9]+$/i', $key)) {
            // Sanity check: real keys look like "ur123-abcdef…" or "m1234-…" or "u1234-…".
            // Don't hard-fail unrecognised formats — UR has changed key prefixes over the years.
            // Just warn-shape via empty error list; live request will tell us.
        }
        return ['ok' => $errors === [], 'errors' => $errors];
    }

    public function discover(array $config): array
    {
        $monitors = $this->fetchAllMonitors($config);
        $nodes = [];
        foreach ($monitors as $m) {
            if (!is_array($m)) {
                continue;
            }
            $id = Safe::get($m, 'id');
            if (!is_int($id) && !is_string($id)) {
                continue;
            }
            $nodes[] = [
                'id'       => (string) $id,
                'label'    => Safe::str(Safe::get($m, 'friendly_name'), '(unnamed)') ?: '(unnamed)',
                'kind'     => 'monitor',
                'parentId' => null,
                'hints'    => $this->describeType((int) Safe::int(Safe::get($m, 'type'))) . ' · ' . Safe::str(Safe::get($m, 'url')),
            ];
        }
        return $nodes;
    }

    public function fetch(array $config, array $itemIds): array
    {
        if ($itemIds === []) {
            return [];
        }
        $monitors = $this->fetchAllMonitors($config);
        $selected = array_flip(array_map('strval', $itemIds));
        $items = [];
        foreach ($monitors as $m) {
            if (!is_array($m)) {
                continue;
            }
            $id = Safe::get($m, 'id');
            if (!is_int($id) && !is_string($id)) {
                continue;
            }
            $idStr = (string) $id;
            if (!isset($selected[$idStr])) {
                continue;
            }
            try {
                $items[] = $this->buildItem($idStr, $m);
            } catch (\Throwable $e) {
                Log::warn('UptimeRobot: failed to parse monitor', ['id' => $idStr, 'error' => $e->getMessage()]);
                $items[] = [
                    'providerId'  => self::id(),
                    'itemId'      => $idStr,
                    'displayName' => Safe::str(Safe::get($m, 'friendly_name'), $idStr) ?: $idStr,
                    'state'       => 'unknown',
                    'severity'    => 'ok',
                    'statusText'  => 'Parse error',
                    'lastSeenAt'  => 0,
                    'elements'    => [],
                    'error'       => $e->getMessage(),
                ];
            }
        }
        return $items;
    }

    /**
     * Loop all paginated monitors.
     *
     * @return array<int, array<string, mixed>>
     */
    private function fetchAllMonitors(array $config): array
    {
        $apiKey = Safe::str(Safe::get($config, 'apiKey'));
        if ($apiKey === '') {
            throw new \RuntimeException('UptimeRobot: missing apiKey');
        }

        $all    = [];
        $offset = 0;
        while (true) {
            $body = http_build_query([
                'api_key'                => $apiKey,
                'format'                 => 'json',
                'response_times'         => 1,
                'response_times_limit'   => 60,
                'response_times_average' => 1,
                'custom_uptime_ratios'   => '1-7-30-90',
                'logs'                   => 1,
                'logs_limit'             => 10,
                'offset'                 => $offset,
                'limit'                  => self::PAGE_SIZE,
            ]);
            $resp = $this->http->request('POST', self::ENDPOINT, [
                'Content-Type'  => 'application/x-www-form-urlencoded',
                'Cache-Control' => 'no-cache',
            ], $body);

            if ($resp['status'] < 200 || $resp['status'] >= 300) {
                throw new \RuntimeException('UptimeRobot HTTP ' . $resp['status']);
            }

            try {
                $json = json_decode($resp['body'], true, 32, JSON_THROW_ON_ERROR);
            } catch (\JsonException $e) {
                throw new \RuntimeException('UptimeRobot: invalid JSON: ' . $e->getMessage());
            }
            if (!is_array($json)) {
                throw new \RuntimeException('UptimeRobot: response root is not an object');
            }
            $stat = Safe::str(Safe::get($json, 'stat'));
            if ($stat !== 'ok') {
                $err = Safe::str(Safe::get($json, 'error.message'), 'unknown error');
                throw new \RuntimeException('UptimeRobot API error: ' . $err);
            }

            foreach (Safe::arr(Safe::get($json, 'monitors')) as $m) {
                $all[] = $m;
            }

            $total = Safe::int(Safe::get($json, 'pagination.total'));
            $offset += self::PAGE_SIZE;
            if ($offset >= $total || count(Safe::arr(Safe::get($json, 'monitors'))) === 0) {
                break;
            }
        }
        return $all;
    }

    /**
     * Build a normalized item from a single monitor record.
     *
     * @param array<string, mixed> $m
     * @return array<string, mixed>
     */
    private function buildItem(string $id, array $m): array
    {
        $rawStatus = Safe::int(Safe::get($m, 'status'), 1);
        [$state, $stateText, $sevHint] = $this->mapStatus($rawStatus);

        $elements = [];

        // counter: response_time (current = average, history = response_times array)
        try {
            $avg = Safe::float(Safe::get($m, 'average_response_time'));
            $history = [];
            foreach (Safe::arr(Safe::get($m, 'response_times')) as $rt) {
                if (!is_array($rt)) {
                    continue;
                }
                $v = Safe::float(Safe::get($rt, 'value'));
                $history[] = $v;
            }
            // response_times comes newest-first; sparkline prefers oldest-left.
            $history = array_reverse($history);
            $rtEl = [
                'type'  => 'counter',
                'key'   => 'response_time',
                'label' => 'Response time',
                'value' => $avg,
                'unit'  => 'ms',
                'thresholds' => ['warn' => 1000, 'crit' => 5000],
            ];
            if ($history !== []) {
                $rtEl['history'] = [
                    'intervalSec' => 300,
                    'values'      => $history,
                ];
            }
            $elements[] = $rtEl;
        } catch (\Throwable $e) {
            Log::info('UptimeRobot: response_time element skipped', ['id' => $id, 'error' => $e->getMessage()]);
        }

        // uptime: windows from custom_uptime_ratio "100.000-93.916-98.688-99.571"
        try {
            $ratiosStr = Safe::str(Safe::get($m, 'custom_uptime_ratio'));
            $labels    = ['24h', '7d', '30d', '90d'];
            if ($ratiosStr !== '') {
                $parts = explode('-', $ratiosStr);
                $windows = [];
                foreach ($parts as $i => $p) {
                    if (!is_numeric($p)) {
                        continue;
                    }
                    $windows[] = [
                        'label' => $labels[$i] ?? "w$i",
                        'ratio' => (float) $p,
                    ];
                }
                if ($windows !== []) {
                    $elements[] = [
                        'type'    => 'uptime',
                        'key'     => 'uptime',
                        'windows' => $windows,
                    ];
                }
            }
        } catch (\Throwable $e) {
            Log::info('UptimeRobot: uptime element skipped', ['id' => $id, 'error' => $e->getMessage()]);
        }

        // events: logs
        try {
            $eventItems = [];
            foreach (Safe::arr(Safe::get($m, 'logs')) as $l) {
                if (!is_array($l)) {
                    continue;
                }
                $type     = Safe::int(Safe::get($l, 'type'));
                $datetime = Safe::int(Safe::get($l, 'datetime'));
                $duration = Safe::int(Safe::get($l, 'duration'));
                $detail   = Safe::str(Safe::get($l, 'reason.detail'));
                [$title, $sev] = $this->mapLogType($type);
                $eventItems[] = [
                    't'           => $datetime,
                    'title'       => $detail !== '' ? "$title — $detail" : $title,
                    'severity'    => $sev,
                    'durationSec' => $duration > 0 ? $duration : null,
                ];
            }
            if ($eventItems !== []) {
                $elements[] = ['type' => 'events', 'key' => 'events', 'items' => $eventItems];
            }
        } catch (\Throwable $e) {
            Log::info('UptimeRobot: events element skipped', ['id' => $id, 'error' => $e->getMessage()]);
        }

        // link: monitored URL
        $url = Safe::str(Safe::get($m, 'url'));
        if ($url !== '') {
            $elements[] = [
                'type'     => 'link',
                'key'      => 'link',
                'label'    => 'Open URL',
                'href'     => $url,
                'external' => true,
            ];
        }

        return [
            'providerId'  => self::id(),
            'itemId'      => $id,
            'displayName' => Safe::str(Safe::get($m, 'friendly_name'), $id) ?: $id,
            'state'       => $state,
            'severity'    => 'ok', // evaluator overwrites
            'statusText'  => $stateText,
            'lastSeenAt'  => $this->lastSeenFromLogs($m),
            'elements'    => $elements,
            'error'       => null,
            '_providerSeverityHint' => $sevHint,
        ];
    }

    /**
     * URL monitors: severity is driven by current status only. Historical uptime
     * ratios are displayed but never push the card into "down" — see Evaluator.
     *
     * @return array{0:string,1:string,2:?string} state, statusText, evaluator-hint
     */
    private function mapStatus(int $status): array
    {
        return match ($status) {
            2       => ['active',  'Operational',     null],
            8       => ['active',  'Seems down',      'degraded'],
            9       => ['active',  'Down',            'down'],
            0       => ['paused',  'Paused',          null],
            default => ['unknown', 'Not checked yet', null],
        };
    }

    /** @return array{0:string,1:string} title + severity */
    private function mapLogType(int $type): array
    {
        return match ($type) {
            1  => ['Down', 'error'],
            2  => ['Up', 'info'],
            98 => ['Started', 'info'],
            99 => ['Paused', 'warn'],
            default => ['Event', 'info'],
        };
    }

    private function describeType(int $type): string
    {
        return match ($type) {
            1 => 'HTTP(S)',
            2 => 'Keyword',
            3 => 'Ping',
            4 => 'Port',
            5 => 'Heartbeat',
            default => 'Monitor',
        };
    }

    /** @param array<string, mixed> $m */
    private function lastSeenFromLogs(array $m): int
    {
        $logs = Safe::arr(Safe::get($m, 'logs'));
        $latest = 0;
        foreach ($logs as $l) {
            if (!is_array($l)) {
                continue;
            }
            $t = Safe::int(Safe::get($l, 'datetime'));
            if ($t > $latest) {
                $latest = $t;
            }
        }
        return $latest;
    }
}
