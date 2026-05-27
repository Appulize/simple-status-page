<?php
declare(strict_types=1);

namespace App\Config;

/**
 * Validates itemConfig.<instanceId:itemId>.thresholdOverrides submitted via
 * POST /api/settings. Pure: no I/O.
 *
 * Override shape: { warn?: number, crit?: number }. Missing keys mean "no
 * override on that side". Empty objects are dropped. Per-element-key bounds:
 *
 *   cpu / mem / disk      → [0, 100]              warn ≤ crit
 *   response_time         → [0, 300000]           warn ≤ crit
 *   uptime / uptime_*     → [0, 100]              warn ≥ crit (lower ratio is worse)
 *
 * Any other element key is rejected. The shape outside thresholdOverrides is
 * left untouched so this can be folded into SettingsValidator without leaking.
 */
class ThresholdValidator
{
    /**
     * @param array<string, mixed> $itemConfig
     * @return array{ok: bool, error?: string, cleaned?: array<string, mixed>}
     */
    public static function validate(array $itemConfig): array
    {
        $cleaned = [];
        foreach ($itemConfig as $itemKey => $cfg) {
            if (!is_string($itemKey) || !is_array($cfg)) {
                return ['ok' => false, 'error' => 'itemConfig entries must be objects keyed by "instanceId:itemId".'];
            }
            $entry = $cfg;
            $rawOverrides = $cfg['thresholdOverrides'] ?? null;
            if ($rawOverrides === null || (is_array($rawOverrides) && $rawOverrides === [])) {
                unset($entry['thresholdOverrides']);
                $cleaned[$itemKey] = $entry;
                continue;
            }
            if (!is_array($rawOverrides)) {
                return ['ok' => false, 'error' => "thresholdOverrides for $itemKey must be an object."];
            }
            $cleanOverrides = [];
            foreach ($rawOverrides as $elKey => $pair) {
                if (!is_string($elKey) || $elKey === '') {
                    return ['ok' => false, 'error' => "thresholdOverrides keys must be non-empty strings."];
                }
                if ($pair === null || (is_array($pair) && $pair === [])) {
                    continue; // drop empty overrides
                }
                if (!is_array($pair)) {
                    return ['ok' => false, 'error' => "thresholdOverrides[$elKey] must be an object."];
                }
                $res = self::validatePair($elKey, $pair);
                if (!$res['ok']) {
                    return $res;
                }
                if ($res['pair'] !== []) {
                    $cleanOverrides[$elKey] = $res['pair'];
                }
            }
            if ($cleanOverrides === []) {
                unset($entry['thresholdOverrides']);
            } else {
                $entry['thresholdOverrides'] = $cleanOverrides;
            }
            $cleaned[$itemKey] = $entry;
        }
        return ['ok' => true, 'cleaned' => $cleaned];
    }

    /**
     * @param array<string, mixed> $pair
     * @return array{ok: bool, error?: string, pair?: array<string, float>}
     */
    private static function validatePair(string $elKey, array $pair): array
    {
        $bounds = self::boundsFor($elKey);
        if ($bounds === null) {
            return ['ok' => false, 'error' => "Unknown threshold key '$elKey'. Allowed: cpu, mem, disk, response_time, uptime (or uptime_*)."];
        }
        [$min, $max, $isUptime] = $bounds;

        $clean = [];
        foreach (['warn', 'crit'] as $side) {
            if (!array_key_exists($side, $pair)) {
                continue;
            }
            $v = $pair[$side];
            if ($v === null || $v === '') {
                continue;
            }
            if (!is_int($v) && !is_float($v) && !(is_string($v) && is_numeric($v))) {
                return ['ok' => false, 'error' => "thresholdOverrides[$elKey].$side must be numeric."];
            }
            $f = (float) $v;
            if ($f < $min || $f > $max) {
                return ['ok' => false, 'error' => "thresholdOverrides[$elKey].$side must be between $min and $max."];
            }
            $clean[$side] = $f;
        }

        if (isset($clean['warn'], $clean['crit'])) {
            if ($isUptime) {
                // Uptime: lower ratio is worse, so warn must be ≥ crit.
                if ($clean['warn'] < $clean['crit']) {
                    return ['ok' => false, 'error' => "thresholdOverrides[$elKey]: warn must be ≥ crit for uptime."];
                }
            } else {
                if ($clean['warn'] > $clean['crit']) {
                    return ['ok' => false, 'error' => "thresholdOverrides[$elKey]: warn must be ≤ crit."];
                }
            }
        }

        return ['ok' => true, 'pair' => $clean];
    }

    /**
     * @return array{0: float, 1: float, 2: bool}|null  [min, max, isUptime]
     */
    private static function boundsFor(string $elKey): ?array
    {
        if ($elKey === 'cpu' || $elKey === 'mem' || $elKey === 'disk') {
            return [0.0, 100.0, false];
        }
        if ($elKey === 'response_time') {
            return [0.0, 300000.0, false];
        }
        if ($elKey === 'uptime' || str_starts_with($elKey, 'uptime_')) {
            return [0.0, 100.0, true];
        }
        return null;
    }
}
