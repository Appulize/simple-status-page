# Providers — contract for new sources

A provider adapts one upstream monitoring system into the normalized item shape
the rest of the app renders. Each provider is a single PHP class in this
directory implementing `App\Providers\Provider`. The `Registry` maps a string
id to the class.

## The interface

```php
interface Provider {
    public static function id(): string;            // stable, lowercase, e.g. "beszel"
    public static function name(): string;          // display name, e.g. "Beszel"
    public static function version(): int;          // bump when configSchema or item keys change
    public static function configSchema(): array;   // fields the settings UI renders

    public function validate(array $config): array;            // [ok, errors]
    public function discover(array $config): array;            // DiscoveryNode[]
    public function fetch(array $config, array $itemIds): array; // NormalizedItem[]
}
```

`discover()` and `fetch()` may throw on upstream/auth failure. The aggregator
catches and applies per-instance backoff.

## Discovery node shape

```jsonc
{
  "id":       "sys_abc::disk::/var",   // opaque to the framework
  "label":    "/var disk",
  "kind":     "host" | "disk" | "interface" | "monitor" | "container" | string,
  "parentId": "sys_abc" | null,
  "hints":    "ext4, 120 GB"            // optional subtitle
}
```

The `id` is **provider-owned**. Composite ids are fine and encouraged
(`{system}::{kind}::{name}`); the framework never parses them.

## Normalized item shape (returned from `fetch()`)

```jsonc
{
  "instanceId":  "uuid",          // injected by aggregator, leave blank
  "providerId":  "beszel",
  "itemId":      "sys_abc::disk::/var",
  "displayName": "/var disk",
  "state":       "active" | "paused" | "maintenance" | "unknown",
  "severity":    "ok" | "degraded" | "down",   // filled by the Evaluator; leave "ok"
  "statusText":  "Operational",
  "lastSeenAt":  1764100000,
  "elements":    [ /* see element types in PLAN §4 */ ],
  "error":       null
}
```

The provider sets `state` (raw, from the upstream) and supplies elements with
their **default thresholds** carried on the element. The server's Evaluator
walks those thresholds and computes the item-level severity. Providers must
not set `severity` themselves.

## Stable element keys — contract

Element `key` is part of the provider contract. Both v1 thresholds and v2
user rules reference elements by key. **Renaming a key breaks user configs.**

Reserved cross-provider keys (use these names whenever the concept matches):

| key             | element type | unit | meaning                          |
|-----------------|--------------|------|----------------------------------|
| `cpu`           | gauge        | %    | overall CPU utilisation          |
| `mem`           | gauge        | %    | overall memory utilisation       |
| `disk`          | gauge        | %    | disk fill on a single mount      |
| `net_rx`        | counter      | MB/s | inbound network throughput       |
| `net_tx`        | counter      | MB/s | outbound network throughput      |
| `response_time` | counter      | ms   | last observed response time      |
| `uptime`        | uptime       | %    | uptime ratio windows             |
| `events`        | events       | —    | recent state-change log          |
| `link`          | link         | —    | external link to the upstream UI |

Default thresholds for these keys live in §7.1 of the plan and are applied by
the Evaluator when the element ships with `thresholds.warn` / `thresholds.crit`.

## Defensive parsing rule (mandatory)

**No raw `$arr['key']` access on upstream payloads.** Use `Util\Safe` only:

```php
use App\Util\Safe;

$cpu      = Safe::float(Safe::get($stats, 'cpu'));
$hostname = Safe::str(Safe::get($details, 'hostname'));
$disks    = Safe::arr(Safe::get($stats, 'disks'));
```

Reasons: upstream JSON shapes drift between versions, fields move, types swap
(int ↔ string). Raw access blows up the entire parse on a single missing key;
defensive access skips just that element and keeps siblings intact.

Per-element parsing must be wrapped in `try { … } catch (\Throwable $e) { /* skip */ }`
so one broken element never wipes a whole item. Per-item parsing is similarly
wrapped so one broken record never wipes a whole instance — return a
`state: "unknown"` item with `error` set instead.

## Test fixtures

Every provider ships:

- `tests/fixtures/<id>/<endpoint>.json` — a real captured response (happy path)
- `tests/fixtures/<id>/<endpoint>_corrupt.json` — a copy with at least one
  load-bearing field missing or mangled

The parser must produce sensible output on both. The corrupt-fixture test
asserts no exception escapes and that the remaining elements still appear.
