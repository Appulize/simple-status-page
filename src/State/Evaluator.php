<?php
declare(strict_types=1);

namespace App\State;

/**
 * Computes per-item severity from element thresholds.
 *
 * Pure: no I/O. Item input shape per PLAN §4; output is the same shape with
 * item.severity, item.statusText and per-element element.severity filled in.
 *
 * Default thresholds per element key (PLAN §7.1). Providers may override by
 * setting element.thresholds on individual elements; the evaluator otherwise
 * applies the per-key default when one exists.
 */
class Evaluator
{
    /** @var array<string, array{warn: float, crit: float}> */
    private const DEFAULT_THRESHOLDS = [
        'cpu'           => ['warn' => 80.0,   'crit' => 95.0],
        'mem'           => ['warn' => 80.0,   'crit' => 95.0],
        'disk'          => ['warn' => 85.0,   'crit' => 95.0],
        'response_time' => ['warn' => 1000.0, 'crit' => 5000.0],
    ];

    /**
     * @param array<string, mixed> $item
     * @return array<string, mixed>
     */
    public function evaluate(array $item): array
    {
        $state = is_string($item['state'] ?? null) ? $item['state'] : 'unknown';

        // Walk elements, attach severity per element. Item severity is the worst.
        $itemSeverity = 'ok';
        $elements     = is_array($item['elements'] ?? null) ? $item['elements'] : [];

        foreach ($elements as $i => $el) {
            if (!is_array($el)) {
                continue;
            }
            $elSeverity = $this->evaluateElement($el);
            $elements[$i]['severity'] = $elSeverity;
            if ($elSeverity === 'crit') {
                $itemSeverity = 'down';
            } elseif ($elSeverity === 'warn' && $itemSeverity !== 'down') {
                $itemSeverity = 'degraded';
            }
        }

        $item['elements'] = $elements;

        // Provider-supplied hint that a non-element signal indicates down (e.g. Beszel host status=down).
        $providerHint = is_string($item['_providerSeverityHint'] ?? null) ? $item['_providerSeverityHint'] : null;
        if ($providerHint === 'down') {
            $itemSeverity = 'down';
        } elseif ($providerHint === 'degraded' && $itemSeverity !== 'down') {
            $itemSeverity = 'degraded';
        }
        unset($item['_providerSeverityHint']);

        // state != active forces severity to ok regardless of element values (PLAN §2.3).
        if ($state !== 'active') {
            $itemSeverity = 'ok';
            // also wipe per-element severity tints so non-active cards never carry red marks
            foreach ($item['elements'] as $i => $el) {
                if (is_array($el)) {
                    $item['elements'][$i]['severity'] = null;
                }
            }
        }

        $item['severity']   = $itemSeverity;
        $item['statusText'] = $item['statusText'] ?? $this->statusTextFor($state, $itemSeverity);
        return $item;
    }

    /**
     * @param array<string, mixed> $el
     * @return "warn"|"crit"|null
     */
    private function evaluateElement(array $el): ?string
    {
        $type = is_string($el['type'] ?? null) ? $el['type'] : '';
        $key  = is_string($el['key']  ?? null) ? $el['key']  : '';

        if ($type === 'uptime') {
            return $this->evaluateUptime($el);
        }

        if ($type !== 'gauge' && $type !== 'counter') {
            return null;
        }

        $value = $el['value'] ?? null;
        if (!is_int($value) && !is_float($value)) {
            return null;
        }

        $thresholds = $this->resolveThresholds($key, $el);
        if ($thresholds === null) {
            return null;
        }

        if (isset($thresholds['crit']) && $value >= $thresholds['crit']) {
            return 'crit';
        }
        if (isset($thresholds['warn']) && $value >= $thresholds['warn']) {
            return 'warn';
        }
        return null;
    }

    /**
     * Uptime windows do not drive severity by default — a monitor that's up *now*
     * shouldn't read "down" because of an outage 30 days ago. Severity for URL
     * monitors comes from the current status (via the provider hint). The
     * uptime element opts in by carrying explicit thresholds.warn / thresholds.crit;
     * when set, the worst-of across windows applies.
     *
     * @param array<string, mixed> $el
     * @return "warn"|"crit"|null
     */
    private function evaluateUptime(array $el): ?string
    {
        $thresholds = $el['thresholds'] ?? null;
        if (!is_array($thresholds)) {
            return null;
        }
        $warn = is_int($thresholds['warn'] ?? null) || is_float($thresholds['warn'] ?? null) ? (float) $thresholds['warn'] : null;
        $crit = is_int($thresholds['crit'] ?? null) || is_float($thresholds['crit'] ?? null) ? (float) $thresholds['crit'] : null;
        if ($warn === null && $crit === null) {
            return null;
        }

        $windows = is_array($el['windows'] ?? null) ? $el['windows'] : [];
        $worst   = null;
        foreach ($windows as $w) {
            if (!is_array($w)) {
                continue;
            }
            $ratio = $w['ratio'] ?? null;
            if (!is_int($ratio) && !is_float($ratio)) {
                continue;
            }
            if ($crit !== null && $ratio < $crit) {
                $worst = 'crit';
            } elseif ($warn !== null && $ratio < $warn && $worst !== 'crit') {
                $worst = 'warn';
            }
        }
        return $worst;
    }

    /**
     * @param array<string, mixed> $el
     * @return array{warn?: float, crit?: float}|null
     */
    private function resolveThresholds(string $key, array $el): ?array
    {
        $explicit = $el['thresholds'] ?? null;
        if (is_array($explicit)) {
            $out = [];
            if (isset($explicit['warn']) && (is_int($explicit['warn']) || is_float($explicit['warn']))) {
                $out['warn'] = (float) $explicit['warn'];
            }
            if (isset($explicit['crit']) && (is_int($explicit['crit']) || is_float($explicit['crit']))) {
                $out['crit'] = (float) $explicit['crit'];
            }
            if ($out !== []) {
                return $out;
            }
        }
        return self::DEFAULT_THRESHOLDS[$key] ?? null;
    }

    private function statusTextFor(string $state, string $severity): string
    {
        return match (true) {
            $state === 'paused'      => 'Paused',
            $state === 'maintenance' => 'Maintenance',
            $state === 'unknown'     => 'Unknown',
            $severity === 'down'     => 'Down',
            $severity === 'degraded' => 'Degraded',
            default                  => 'Operational',
        };
    }
}
