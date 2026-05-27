<?php
declare(strict_types=1);

namespace App\Config;

/**
 * Validates and merges a settings document submitted via POST /api/settings.
 * Pure: no HTTP I/O. Returns either ['ok' => true, 'merged' => array] or
 * ['ok' => false, 'status' => int, 'error' => string].
 */
class SettingsValidator
{
    /**
     * @param array<string, mixed> $incoming  body['settings']
     * @param array<string, mixed> $current   server-side current cfg
     * @return array{ok: bool, status?: int, error?: string, merged?: array<string, mixed>}
     */
    public static function validate(array $incoming, array $current): array
    {
        foreach (['auth', 'ui', 'instances', 'displayOrder', 'itemConfig'] as $k) {
            if (!array_key_exists($k, $incoming)) {
                return ['ok' => false, 'status' => 400, 'error' => "Missing required field: $k"];
            }
        }
        if (!is_array($incoming['auth']) || !is_array($incoming['ui'])) {
            return ['ok' => false, 'status' => 400, 'error' => 'auth and ui must be objects.'];
        }
        if (!is_array($incoming['instances']) || !is_array($incoming['displayOrder']) || !is_array($incoming['itemConfig'])) {
            return ['ok' => false, 'status' => 400, 'error' => 'instances, displayOrder, itemConfig must be arrays.'];
        }

        // Preserve server-controlled fields.
        $incoming['schemaVersion']        = $current['schemaVersion'] ?? 1;
        $incoming['auth']['passwordHash'] = $current['auth']['passwordHash'] ?? '';

        // Lockout guard.
        $methods = $incoming['auth']['methods'] ?? [];
        $anyEnabled = false;
        foreach (['form', 'basic', 'token', 'clientCert'] as $m) {
            if (($methods[$m]['enabled'] ?? false) === true) {
                $anyEnabled = true;
                break;
            }
        }
        if (!$anyEnabled) {
            return ['ok' => false, 'status' => 400, 'error' => 'At least one auth method must remain enabled.'];
        }

        // Bearer token preservation: enabling the method without supplying a
        // token (e.g. UI hides the value) keeps the prior token instead of
        // silently wiping it.
        if (($methods['token']['enabled'] ?? false) === true) {
            $newTok = (string) ($methods['token']['token'] ?? '');
            if ($newTok === '') {
                $incoming['auth']['methods']['token']['token'] = (string) ($current['auth']['methods']['token']['token'] ?? '');
            }
        }

        return ['ok' => true, 'merged' => $incoming];
    }
}
