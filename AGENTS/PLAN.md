# Simple Status Page — Implementation Plan (v1)

Status: approved · Date: 2026-05-26

A fast, lightweight, gorgeous status page for self-hosted servers and services.
Public read view, authenticated settings, modular providers, resilient parsers.

---

## 1. Stack and deployment

- **Backend:** PHP 8.2+, no framework, no Composer. Manual PSR-4 autoloader (namespace prefix `App\`).
- **Frontend:** Vanilla JS + modern CSS. No framework, no build step, no `node_modules`.
- **Storage:** Single JSON file `config/settings.json`. Atomic writes (`LOCK_EX` + temp + rename).
- **Server cache:** File-based TTL cache at `cache/state.json` with stale-while-error fallback.
- **Sessions:** PHP sessions, save path overridden to `cache/sessions/`.
- **Reverse proxy:** Caddy + PHP-FPM. A reference `Caddyfile.example` ships in the repo.
- **PHP requirements:** opcache enabled (documented), cURL, json, openssl extensions.
- **Strict types:** `declare(strict_types=1);` in every PHP file. PSR-12 style.

### File layout

```
public/                       Caddy webroot
  index.php                   front controller + SPA shell
  assets/{app.css, app.js}
  api/{state, config, settings, discover, auth, login, logout, onboard, health}.php
src/                          outside webroot, PSR-4 (App\)
  Providers/{Provider, Registry, Beszel, UptimeRobot}.php
  Providers/README.md         provider contract (required reading for new providers)
  Auth/{Authenticator, Session, Password, Token, Throttle}.php
  Config/{Store, Migrations}.php
  State/{Aggregator, Cache, Evaluator, HttpClient, Backoff}.php
  Http/{Request, Json, Csrf, ErrorHandler}.php
  Util/{Safe, Log, Time}.php
config/
  settings.json               UI-editable; secrets live here
cache/
  state.json
  sessions/
  throttle/                   per-IP login attempt counters
tests/
  run.php                     no-Composer test runner
  fixtures/{beszel,uptimerobot}/*.json
AGENTS/PLAN.md
Caddyfile.example
README.md
LICENSE
```

---

## 2. Architectural pillars

### 2.1 Normalize on the server
Each provider's data is converted server-side into one normalized item shape. The
browser renders one kind of card regardless of source. Adding a provider never
touches frontend code.

### 2.2 Modular providers (forward-compatible from day one)
A small `Provider` interface. Each provider is one file in `src/Providers/`. A
`Registry` discovers them. Adding a provider = one new class + register call.

### 2.3 Two conceptually separate display axes
- **Severity** (metric-derived, computed): `ok` | `degraded` | `down`. Produced by
  threshold evaluation today; by user rules in v2.
- **State** (provider/operator concept): `active` | `paused` | `maintenance` | `unknown`.
  Always supplied by the provider.

Display rule: if `state ≠ active`, show the state pill (muted). Otherwise show
severity (green/amber/red). A paused-but-last-severity-was-down monitor shows as
paused, not red. This separation is what lets v2 add user rules without
touching the provider contract.

### 2.4 Resilient parsing (4-layer degradation)
Failures degrade gracefully, never cascade. See §11.

### 2.5 Always-flat display, hierarchy is metadata
Discovery returns a flat list of selectable nodes with optional `parentId`
hierarchy info. The settings catalog renders that as a tree for visibility
toggles. The main view is a flat, user-ordered list of visible items —
sub-items render as fully independent cards.

---

## 3. Provider interface

```php
<?php
declare(strict_types=1);
namespace App\Providers;

interface Provider {
    public static function id(): string;            // "beszel"
    public static function name(): string;          // "Beszel"
    public static function version(): int;          // bumped on config schema change
    public static function configSchema(): array;   // fields the UI renders

    public function validate(array $config): array;            // [ok: bool, errors: string[]]
    public function discover(array $config): array;            // DiscoveryNode[]
    public function fetch(array $config, array $itemIds): array; // NormalizedItem[]
}
```

### Discovery node

```jsonc
{
  "id": "sys_abc::disk::/var",   // opaque to framework, composite, provider-owned
  "label": "/var disk",
  "kind": "host" | "disk" | "interface" | "monitor" | "container" | string,
  "parentId": "sys_abc" | null,  // settings-UI tree only; ignored at render
  "hints": "ext4, 120 GB"        // small descriptive subtitle (optional)
}
```

Element `key` is part of the provider contract — **stable across versions.** Both
v1 thresholds and v2 rules will reference elements by key. Document this in
`src/Providers/README.md`. A provider author who renames a key breaks user configs.

### IDs
Composite, opaque, provider-owned (`sys_abc::disk::/var`). The framework never
parses them. `fetch()` accepts a mixed list of parent and child ids; the
provider groups them internally and batches the underlying API calls (one
`system_stats` fetch covers all sub-items for that host).

---

## 4. Normalized item shape (rendered by the frontend)

```jsonc
{
  "instanceId": "uuid",
  "providerId": "beszel",
  "itemId": "sys_abc::disk::/var",
  "displayName": "/var disk",
  "state": "active" | "paused" | "maintenance" | "unknown",
  "severity": "ok" | "degraded" | "down",
  "statusText": "Operational",         // human-readable, optional
  "lastSeenAt": 1764100000,
  "parentId": null,                    // present in discovery only; absent at render in v1
  "elements": [ /* see below */ ],
  "error": null                        // string when this item failed to fetch/parse
}
```

`state`, `severity`, `statusText` are computed by the server's evaluator (§7),
not by the provider. The provider returns the raw state and the elements (with
their default thresholds); the evaluator computes severity and applies user
overrides.

### Element types (v1)

Every element is independently renderable. Adding an element type is a frontend
change; adding a provider is not.

| `type`     | Shape                                                                                                                                                          | Use cases                          |
|------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------|
| `gauge`    | `{key, label, value, unit, max?, thresholds?: {warn?, crit?}, severity?: "warn"\|"crit"\|null, history?: {intervalSec, values[]}}`                              | CPU %, RAM %, disk %               |
| `counter`  | `{key, label, value, unit, thresholds?, severity?, history?}` — no `max`, no gauge semantics                                                                   | response_time ms, requests/s, p99  |
| `uptime`   | `{windows: [{label, ratio}]}` — arbitrary number of windows                                                                                                    | 24h/7d/30d/90d                     |
| `boolean`  | `{key, label, value, trueLabel?, falseLabel?}`                                                                                                                 | "Passing", "Synced", "SSL valid"   |
| `text`     | `{rows: [{label, value, mono?: bool}]}`                                                                                                                        | hostname, OS, commit SHA           |
| `events`   | `{items: [{t, title, severity: "info"\|"warn"\|"error", durationSec?, href?}]}` — irregular timeseries                                                         | downtime log, deploys, incidents   |
| `link`     | `{label, href, external?: bool}`                                                                                                                               | "Open in Grafana"                  |

Rules:
- `history` uses `{intervalSec, values: []}` — evenly-spaced numeric series.
  Irregular series go in `events`. This wire format is compact and fits sparkline
  rendering directly.
- `state` is optional in the provider's raw output. Providers without a
  meaningful state emit `"active"`; the card relies entirely on element
  thresholds + computed severity. Providers with paused/maintenance concepts
  emit those literals.
- Thresholds are **advisory at the element layer** (paint that one number
  warn/crit) and **load-bearing at the card layer** via the evaluator.

---

## 5. Settings schema (`config/settings.json`)

```jsonc
{
  "schemaVersion": 1,
  "auth": {
    "passwordHash": "$2y$...",
    "methods": {
      "form":       { "enabled": true },
      "basic":      { "enabled": false },
      "token":      { "enabled": false, "token": "" },
      "clientCert": { "enabled": false, "headerName": "X-Client-Cert-Subject", "allowedSubjects": [] }
    }
  },
  "ui": { "refreshIntervalSec": 30, "theme": "auto" },
  "instances": [
    {
      "id": "uuid",
      "provider": "beszel",
      "providerVersion": 1,
      "name": "Production",
      "config": { "url": "https://beszel.example", "username": "user@host", "password": "..." },
      "items": [
        { "id": "sys_abc",             "visible": true,  "displayName": null },
        { "id": "sys_abc::disk::/var", "visible": true,  "displayName": "/var" },
        { "id": "sys_abc::disk::/",    "visible": false, "displayName": null }
      ]
    }
  ],
  "displayOrder": [
    { "instanceId": "uuid",        "itemId": "sys_abc" },
    { "instanceId": "uuid",        "itemId": "sys_abc::disk::/var" },
    { "instanceId": "other-uuid",  "itemId": "monitor_42" }
  ],
  "itemConfig": {
    "<instanceId>:<itemId>": {
      "displayName": "/var disk",
      "thresholdOverrides": {
        "cpu":  { "warn": 75, "crit": 90 },
        "disk": { "warn": 90 }
      }
      // v2 slots in here without migration:
      //   "customRules":    [ {element, op, value, severity} ],
      //   "evaluationMode": "thresholds" | "rules" | "both",
      //   "mutePeriods":    [ ... ]
    }
  }
}
```

Why `itemConfig` is a separate top-level table rather than embedded in
`instances[].items[]`:
- Survives re-discovery — items come and go, user config stays bound to the
  composite id.
- Same shape for parent items and sub-items.
- v2 additions land in one place.

Why `displayOrder` is separate from `instances[].items[]`:
- `items[]` is the catalog (what exists + visibility).
- `displayOrder[]` is the user's chosen flat order of visible items across all
  instances and providers — allows interleaving (host from A, disk from B, monitor
  from C).

---

## 6. Authentication

### 6.1 Public vs protected endpoints
**Public:** `/`, `/api/state`, `/api/config`, `/api/auth`, `/health`.
**Protected:** `/api/settings` (GET/POST), `/api/discover`, `/api/logout`, plus
the SPA overlays for `/options` and `/about` (UI renders but content is blocked
until authenticated).
**First-run only:** `/api/onboard` (closes as soon as the admin password is set).

### 6.2 First-run onboarding
First-run = `config/settings.json` missing OR `auth.passwordHash` empty.

- `GET /api/auth` returns `{firstRun: true}`.
- SPA renders an onboarding overlay that forces the user to set an admin
  password before anything else.
- `POST /api/onboard {password}` writes the bcrypt hash to settings, enables
  the `form` method (only). Status view becomes immediately public.

### 6.3 Four auth methods, all UI-configurable
1. **HTML form** (default after first-run). `POST /api/login {password}` →
   `password_verify` against `auth.passwordHash`, `session_regenerate_id(true)`,
   sets PHP session, returns CSRF token. Cookie flags: `HttpOnly`, `Secure`
   (when HTTPS), `SameSite=Lax`.
2. **HTTP Basic.** Uses the same `passwordHash`. PHP reads
   `PHP_AUTH_USER`/`PHP_AUTH_PW` and `password_verify`s. For `curl` / scripts.
3. **API key in header.** `Authorization: Bearer <token>`. Token auto-generated
   (`bin2hex(random_bytes(32))`) when enabled, stored plaintext in settings,
   shown in the UI with a "rotate" button. Compared with `hash_equals`.
4. **Client certificate (via Caddy).** Caddy validates the cert and forwards a
   header (default `X-Client-Cert-Subject`). UI holds an allowlist of subject
   DNs. Sample Caddyfile snippet ships in the repo.

### 6.4 Lockout prevention
- At least one method must remain enabled. The UI disables the off-toggle on
  the last enabled method with an explanation.
- A "Change password" form exists in settings for authenticated users.
- Recovery: documented filesystem edit — clear `auth.passwordHash` in
  `settings.json` → triggers re-onboarding on next load.

### 6.5 Auth check order on protected endpoints
1. Session (form login)
2. API token (if enabled)
3. HTTP Basic (if enabled)
4. Client cert (if enabled)

### 6.6 CSRF
- Required (header `X-CSRF-Token`) on all state-changing POSTs from form/session
  auth.
- Token-based (Bearer) auth is CSRF-exempt — cannot be triggered cross-origin
  without the token.

### 6.7 Brute-force throttle
- File-counter throttle in `cache/throttle/<ip-hash>`: 5 failed attempts /
  5 min / IP → returns 429 with `Retry-After`. Independent of Caddy/fail2ban.

### 6.8 Concurrent settings edits
- `GET /api/settings` returns current `mtime` of `settings.json`.
- `POST /api/settings` includes `If-Match: <mtime>`; mismatch → 409 with the
  conflicting current value. UI prompts the user to merge.

---

## 7. Severity evaluation (Option 2, v2-ready)

The evaluator always operates on a rule list internally. For v1 the rule list
is synthesized from element thresholds; in v2 user-defined `customRules` will
be concatenated. **Same evaluator, same output shape, zero migration.**

### 7.1 Default thresholds per element kind

Provider ships sensible defaults:

| element kind        | `warn` | `crit` |
|---------------------|--------|--------|
| `cpu` (%)           | 80     | 95     |
| `mem` (%)           | 80     | 95     |
| `disk` (%)          | 85     | 95     |
| `response_time` (ms)| 1000   | 5000   |
| `uptime` (% window) | 99.0   | 95.0   |

Overrides in `itemConfig.<key>.thresholdOverrides.<elementKey>` are deep-merged
(partial overrides allowed — set just `warn` and inherit `crit`).

### 7.2 Algorithm

```
for each element with thresholds.warn → emit rule {key, >=, warn, degraded}
for each element with thresholds.crit → emit rule {key, >=, crit, down}

triggered = rules where condition met against current element values
itemSeverity = max severity across triggered  (worst-of, never first-match-wins)
providerSeverity = map(state) → ok | degraded | down
finalSeverity = max(providerSeverity, itemSeverity)

per element: set element.severity = "warn" | "crit" | null  (so UI can tint individual values)
```

Severity vocabulary is **string-named** (`ok` / `degraded` / `down`), trivial to
extend. Combining strategy is always worst-of.

### 7.3 v2 doors held open
- `itemConfig` already has space for `customRules`, `evaluationMode`, `mutePeriods`.
- Severity scope tiers (`providerDefaults`, `instanceConfig`) can be added as new
  top-level merge tiers. Merge order will be: provider default → instance
  override → item override → user custom rules. v1 only ships item override.
- Element `severity` is in the API response today even though v1 only sets it
  from thresholds — load-bearing for v2 per-element rule displays.

### 7.4 Settings UI for thresholds (v1)
A collapsible "Thresholds" panel per item, listing every element that has
default thresholds, with two number inputs (warn, crit) pre-filled with the
provider default. "Reset to defaults" clears the override. v2 will add a
"Custom rules" section in the same panel.

---

## 8. API endpoints

```
GET  /api/state              public      normalized items array, ETag, Cache-Control: private, no-cache
GET  /api/config             public      UI config (theme, refreshIntervalSec, item order, lastDiscoveryAt)
GET  /api/auth               public      { authenticated, firstRun, method, csrfToken? }
POST /api/login              public      { password } → session + CSRF, 429 if throttled
POST /api/logout             auth        end session
POST /api/onboard            firstRun    { password } → set initial password, enable form method
GET  /api/settings           auth        full settings (secrets included for the admin), Cache-Control: private, no-store
POST /api/settings           auth+CSRF   patch settings, requires If-Match: <mtime>
POST /api/discover           auth+CSRF   { instanceId } → DiscoveryNode[] (or { provider, config } for unsaved instance)
GET  /health                 public      200 + {version, uptimeSec}
```

### `/api/state` response

```jsonc
{
  "items": [ /* NormalizedItem[] in displayOrder */ ],
  "meta": {
    "generatedAt": 1764100000,
    "freshness": "fresh" | "stale",
    "staleSince": null | 1764090000,
    "instanceErrors": { "<instanceId>": "auth failed" }
  }
}
```

Per-item failures appear as items with `error` set + `state: "unknown"`. Per-
instance failures appear in `meta.instanceErrors` with all of that instance's
items also flagged.

---

## 9. State aggregation and caching

1. `/api/state` invoked → `Aggregator::get()`.
2. `Cache::get('state', ttl)` → return immediately if fresh.
3. **Cache stampede prevention.** Try to acquire `flock(LOCK_EX | LOCK_NB)` on
   `cache/state.json`. If acquired → regenerate. If not → another worker is
   regenerating; serve current cache (may be slightly stale) without waiting.
4. Regeneration: loop instances → resolve provider → call `fetch(config, selectedItemIds)`.
   - Each instance fetch is wrapped in try/catch; failures populate `instanceErrors`,
     items synthesized with `state: "unknown"` + `error`.
   - Apply per-instance backoff (§11): if instance is in cooldown, skip and serve
     stale items + a cooldown note.
5. Apply visibility filter and `displayOrder` ordering.
6. Run `Evaluator` over the items to compute severities.
7. Write cache atomically; emit `ETag` (hash of payload body).
8. **Stale-while-error fallback.** If regeneration fails entirely, return the
   last cache with `meta.freshness = "stale"` + `staleSince` timestamp. Never
   return an empty page when older data exists.

### Cache TTL
`ttl = max(5s, min(10s, refreshIntervalSec / 2))`. Browser polling intervals
shorter than TTL just hit cache; longer intervals trigger a fetch per poll.

### Outbound HTTP timeouts (per upstream request)
- `CURLOPT_CONNECTTIMEOUT = 5`
- `CURLOPT_TIMEOUT = 15`
- `CURLOPT_PROTOCOLS = CURLPROTO_HTTP | CURLPROTO_HTTPS`
- `CURLOPT_SSL_VERIFYPEER = true`
- `CURLOPT_FOLLOWLOCATION = false`
- Sensible UA header, accept gzip.

---

## 10. Frontend

### 10.1 Files
- `assets/app.js` — tiny reactive store, fetcher (visibility + ETag + countdown),
  History API routing for `/`, `/options`, `/about`, render functions per element
  type, sparkline SVG, drag-reorder.
- `assets/app.css` — OKLCH design tokens, CSS Grid + container queries, View
  Transitions for overlays, `prefers-color-scheme` + manual override,
  `prefers-reduced-motion` respected.
- No build step. The PHP front controller serves `index.php` for unknown SPA
  routes.

### 10.2 Polling
- Default 30s, configurable 5–600s.
- `document.visibilityState === 'visible'` guards polling; resumes on focus.
- `If-None-Match` on every poll; 304 = no DOM work.
- Visible countdown to next refresh in the menu icon.

### 10.3 Rendering
- One renderer per element type (~6 small functions). The card composes elements.
- Card grid is keyed by `instanceId + itemId`. On each refresh, only mutate
  elements that changed (no innerHTML of the grid).
- **XSS rule: never set `innerHTML` with provider data.** `textContent` and
  `createElement` only. Documented as a code rule.

### 10.4 Visual direction
- Auto dark/light + manual override.
- Status conveyed by color **and** icon **and** text (not color alone).
- System font stack, monospace numerals for metrics.
- Inline SVG sparklines (`<polyline>` + gradient fill, no library).
- Subtle motion only (status-change pulse, refresh tick). Respects
  `prefers-reduced-motion`.
- Floating top-right menu button (glass background, fixed position, keyboard
  accessible), opens options drawer or about modal.
- Mobile-first; cards reflow via container queries.

### 10.5 Affordances
- **Stale indicator** — when cache is served past freshness, subtle top banner
  with "Last updated 2 min ago".
- **Empty / error states** — no instances → first-add CTA; per-instance failure
  → faded cards with hover-error tooltip; all failed → top banner.
- **Dynamic page title** — `(2 down) · Status` so the tab is informative.
- **Favicon tint** by worst current severity (small SVG generated client-side).
- **Accessibility** — `aria-live="polite"` on the status region for transitions,
  visible focus rings, full keyboard nav for menu and settings.
- **Time** — server emits Unix seconds; client renders relative ("12s ago") with
  absolute on hover in browser locale.

### 10.6 Settings UI

Two panels:

**Catalog (top).** Per-instance tree showing every discovered item with indent
for hierarchy. Each row has:
- Visibility checkbox
- Rename inline
- "Thresholds" collapsible (per-element warn/crit number inputs, "Reset" button)

Per instance: `[Re-discover]` button, `[Edit config]` button, `[Remove]` button.

**Display order (bottom).** Single flat draggable list of all currently-visible
items, in `displayOrder`. Drag a row anywhere (across instances and providers).
This is what the status page will actually show.

Why two panels rather than one combined view: scales to 50+ items, makes the
"what's shown vs what exists" mental model unambiguous, avoids the surprise of
dragging a row from one instance group into another.

Adding an instance: provider picker → config form (built from `configSchema()`)
→ "Test & discover" runs `validate()` then `discover()` and shows the resulting
tree with all items pre-selected → save.

---

## 11. Resilient parsing (4-layer degradation)

Every layer catches, attaches an error, returns valid output. Failures never
cascade.

1. **Aggregator** wraps per-instance fetches. A dead instance returns its
   items with `state: "unknown"` + instance-level `error`. Sibling instances
   unaffected.
2. **Provider `fetch`** wraps per-item parse. A malformed record yields a
   minimal `{id, displayName, state: "unknown", error}` item. Sibling items
   unaffected.
3. **Element parse** wraps per-element extraction. A missing or malformed
   `cpu` skips that element. Sibling elements still rendered.
4. **Field coercion** uses defensive accessors only. Unknown keys ignored,
   missing keys skipped silently, numeric strings coerced, type mismatches
   skipped.

### `Util\Safe` helpers (mandatory in provider code)

```php
Safe::num($arr, 'path.to.key', $default = null): ?float
Safe::str($arr, 'path.to.key', $default = null): ?string
Safe::arr($arr, 'path.to.key', $default = []): array
Safe::bool($arr, 'path.to.key', $default = null): ?bool
```

**Code rule: no raw `$arr['key']` in provider parse code.** Enforced in review.

### Additional resilience
- **Stale-while-error cache fallback** (§9). UI shows "stale" banner.
- **Cache schema version** in the cache file header; mismatch → treat as missing.
- **settings.json corruption.** Never auto-overwrite. Show error in UI;
  preserve the file so the user can fix it manually.
- **Per-instance backoff.** On failure, double the next-attempt delay (cap 5
  min). On success, reset. Prevents hammering a dead upstream.
- **Test fixtures.** Captured real responses + corrupted/mutated copies under
  `tests/fixtures/`. `tests/run.php` exercises parsers against both, exits
  non-zero on failure.

---

## 12. Provider — UptimeRobot (v1)

- **Endpoint:** `POST https://api.uptimerobot.com/v2/getMonitors`
  (Content-Type: `application/x-www-form-urlencoded`).
- **Auth:** read-only API key in `api_key` body field. Main key works too;
  read-only is the documented safer choice.
- **Server-side proxy** (not browser-direct). Reasons: shared cache across
  clients, key kept off the wire, single polling code path.
- **Params we send:**
  `format=json`, `response_times=1`, `response_times_limit=60`,
  `response_times_average=1`, `custom_uptime_ratios=1-7-30-90`, `logs=1`,
  `logs_limit=10`.
- **Pagination:** `offset`/`limit` (max 50); loop until
  `pagination.total` consumed.
- **Rate limits:** Free 10 req/min, Pro `monitors * 2` (max 5000). Server cache
  TTL respects this. `X-RateLimit-*` headers monitored and surfaced in logs.

### Mapping

Monitor `status` → state + severity:
- 2 (up) → state: active, severity: ok
- 8 (seems down) → state: active, severity: degraded
- 9 (down) → state: active, severity: down
- 0 (paused) → state: paused
- 1 (not checked yet) → state: unknown

Monitor `type` (1=HTTP, 2=keyword, 3=ping, 4=port, 5=heartbeat) surfaced in
discovery `hints`.

### Discovery
Returns each monitor as a flat node: `{id, label=friendly_name, kind="monitor", parentId=null, hints=type+url}`.

### Fetch
Returns normalized item per monitor:
- `state` per mapping above; provider does NOT set severity (evaluator does).
- `elements`:
  - `counter` `response_time` (ms) from latest `response_times` value, history
    from the rest.
  - `uptime` with windows derived from `custom_uptime_ratios` (1d, 7d, 30d, 90d).
  - `events` from `logs` (down/up/paused entries → `{t: datetime, title, severity, durationSec: duration}`).
  - `link` to the monitored URL.

---

## 13. Provider — Beszel (v1)

Beszel hub = PocketBase. Official REST API docs:
`https://beszel.dev/guide/rest-api`.

### 13.1 Auth
- Authenticate as a **regular user** (NOT superuser). Beszel's documented
  integration path. Access to systems is scoped by the `systems.users` relation.
  The operator assigns the user to the systems they want exposed.
- `POST {hubUrl}/api/collections/users/auth-with-password` with
  `{identity, password}` → returns `{token, record}`.
- Send `Authorization: <token>` (PocketBase format; no "Bearer" prefix) on
  subsequent requests.
- **JWT lifecycle.** Cache the token in-process for the request; on 401,
  re-auth once and retry. Never persist the token.

### 13.2 Endpoints used
- **List systems:**
  `GET {hubUrl}/api/collections/systems/records?perPage=200`
  Fields: `id`, `name`, `status` (up|down|paused|pending), `host`, `port`,
  `info` (json), `created`, `updated`.
- **List system_details for a system:**
  `GET {hubUrl}/api/collections/system_details/records?filter=system='{id}'&perPage=1`
  Fields: `hostname`, `os_name`, `kernel`, `cpu`, `arch`, `os`, `cores`,
  `threads`, `memory`, `podman`, `updated`.
- **Latest stats + sparkline history for a system:**
  `GET {hubUrl}/api/collections/system_stats/records?filter=system='{id}'%20%26%26%20type='1m'&sort=-created&perPage=60`
  Fields: `id`, `system`, `stats` (json, max 2 MB), `type` (1m|10m|20m|120m|480m),
  `created`, `updated`.

### 13.3 Status mapping
- `up` → state: active
- `down` → state: active, severity-via-evaluator will see element issues; if
  no element data, provider sets severity hint via empty elements + statusText.
  Practically: `down` → state: active, but provider attaches an `error` of
  "host reported down" and elements have no values → evaluator sees no
  thresholds triggered. So we explicitly set severity to `down` via the
  internal `providerSeverityOverride` field on the item — supported by the
  evaluator as the "providerSeverity" input. (Implementation detail: the
  Provider may return an item with a `_providerSeverity: "down"` hint
  consumed only by the evaluator; not part of the public element shape.)
- `paused` → state: paused
- `pending` → state: unknown

### 13.4 Stats blob — undocumented, defensive
Beszel's `stats` JSON shape is undocumented and stated to change in minor
releases. The provider parses defensively (§11). On first wiring against a
live Beszel, the current keys are captured into `tests/fixtures/beszel/` and
the parser is tested against them.

Initial best-effort mapping (verified live during build step 7):
- `cpu` → `gauge` `cpu` (%, max 100)
- `mem` / `memUsed` / `memPct` → `gauge` `mem` (%, max 100)
- `disk` / `diskUsed` / `diskPct` → `gauge` `disk` (%, max 100); per-disk
  entries become sub-items at discovery time
- `net.rx` / `net.tx` (or similar) → `counter` `net_rx` / `net_tx` (KB/s or MB/s)
- Container entries become sub-items only if Docker stats are present
- Unknown keys: ignored (logged at info)

### 13.5 Discovery
- Auth → list systems → for each system fetch one `system_stats` record and
  `system_details` to enumerate sub-items (disks, network interfaces, sensors,
  containers).
- Return flat tree: host node + child nodes per sub-entity.
- Cost: `1 + 2N` API calls. Only on user-triggered discovery; periodic
  polling unaffected.

### 13.6 Fetch
- Group requested `itemIds` by parent system.
- One `system_stats` query per system covers all that system's selected
  sub-items (one fetch yields host card data + every disk/interface card).
- One `system_details` query per system for the `text` element.
- Normalize and return.

### 13.7 Config schema
- `url` (https URL, required)
- `username` (email, required)
- `password` (secret, required)

### 13.8 Live-verification notes
- Beszel collection rules in the migration snapshot show `listRule: null`
  (superuser-only) but the docs show regular-user querying works. Confirm on
  a live hub during integration; document the systems-to-users assignment
  requirement clearly in README.

---

## 14. Security

- **SSRF.** Outbound HTTP only to user-configured URLs. cURL restricted to
  HTTP/HTTPS, TLS verify on, redirects disabled, timeouts set. No private-IP
  denylist (user may legitimately target localhost/LAN); risk documented in
  settings UI.
- **Brute-force throttle.** §6.7.
- **CSRF.** §6.6.
- **Session fixation.** `session_regenerate_id(true)` on every login.
- **Strict CSP.** `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`.
  Feasible because no framework, no inline scripts.
- **Other security headers.** `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
  `Strict-Transport-Security: max-age=31536000; includeSubDomains` when HTTPS.
- **Cache-Control: private, no-store** on every `/api/settings*`, `/api/discover`,
  `/api/auth`.
- **Error handler.** Production returns generic 500 body with opaque incident
  id; full detail goes to FPM error log. Never leaks paths or stack traces.
- **XSS rule.** §10.3.
- **Secrets in GET /api/settings.** Returned plaintext to the authed admin
  (single tenant). UI masks them by default with a "reveal" toggle.
- **File permissions.** `config/` and `cache/` 0700, files 0600, owned by FPM
  user. Install docs cover it.
- **Token compare.** `hash_equals`. **Password compare.** `password_verify`.
  Both constant-time.
- **Cookie flags.** `HttpOnly`, `Secure` (HTTPS), `SameSite=Lax`.

---

## 15. Performance

- **Cache stampede prevention** via `flock` on regeneration. §9.
- **Outbound timeouts** 5s connect / 15s total. §9.
- **Parallel provider fetches.** v1 serial. `curl_multi_*` only if measured need.
- **Compression.** Caddy gzip/zstd, documented in `Caddyfile.example`.
- **Opcache** enabled, documented in `README.md`.
- **DOM update strategy.** Card grid keyed by item id; only mutate elements
  that changed. No full re-render per poll. §10.3.
- **ETag on `/api/state`.** Client sends `If-None-Match`; 304 saves bandwidth
  and DOM work.

---

## 16. Maintainability

- **Strict types** everywhere. PSR-12.
- **No globals.** `Http\Request` wraps `$_SERVER`/`$_GET`/`$_POST`/headers.
- **`Util\Log`** wraps `error_log` with levels (info/warn/error). Never logs
  secrets.
- **Schema versioning.** `settings.json` carries `schemaVersion`. `Config\Migrations`
  runs migrations on read. v1 = 1.
- **Provider versioning.** Each provider has a `VERSION` constant. Each
  instance stores `providerVersion`. Per-provider migration callback runs on
  read when stored < current.
- **Provider contract doc.** `src/Providers/README.md` — interface, stable-key
  rule, defensive-parsing rule, normalized shape. Required reading.
- **Tests.** `tests/run.php` — tiny no-Composer runner. Asserts against
  fixtures (happy path + corrupted variants). Exits non-zero on failure.
  Easy to wire to CI later.

---

## 17. Operational

- **Health endpoint.** `GET /health` → `{status: "ok", version, uptimeSec}`.
- **Logging.** FPM error log (PHP `error_log`). All upstream failures go here
  with instance id + provider id + a redacted error.
- **Backups.** `settings.json` is the only durable state. Document in README.
- **Upgrade path.** Replace files; schema migrations run on first read.
- **Time.** Server uses UTC internally; client renders in browser locale.
- **No instances configured.** Show empty-state CTA in main view, plus
  unauth'd users see "Status page not yet configured" rather than a blank page.

---

## 18. Out of scope for v1 (deliberately)

- i18n (English only)
- Email/webhook alerts (status page is not a notifier)
- Historical incident log (a future provider could expose this; not built-in)
- Multi-user accounts (single admin, single tenant)
- Pull-to-refresh on mobile (visibility-based auto-refresh covers it)
- `curl_multi` parallel provider fetches
- Rule editor (Option 2 thresholds only; rules in v2)
- Per-instance and per-provider threshold defaults (item-level only in v1;
  upper tiers slot in cleanly later)
- Container/Docker stats (parser will handle them if Beszel returns them, but
  not first-class in v1 settings UI)

---

## 19. Build order

1. Repo scaffold + autoloader + `Caddyfile.example` + `public/index.php` front
   controller + error handler + security headers + CSP.
2. `Config/Store` with atomic JSON write + corruption-safe read.
   `Config/Migrations` skeleton.
3. `Util/Safe`, `Util/Log`, `Http/Request`, `Http/Json`, `Http/Csrf`.
4. `Auth/*` — Password, Token, Session, Throttle. CSRF. First-run detection.
5. `/api/auth`, `/api/login`, `/api/logout`, `/api/onboard`. Login throttle wired.
6. `Providers/Provider` interface + `Registry`. `Providers/README.md`.
7. `State/HttpClient` (cURL with hardened defaults). `State/Backoff`.
   `State/Cache` (file TTL + stampede flock + stale-while-error).
   `State/Evaluator`.
8. `Providers/UptimeRobot` end-to-end. Fixtures captured. Parser tests.
9. `Providers/Beszel` end-to-end against a live hub. Fixtures captured.
   `stats` keys pinned. Parser tests including corrupted-fixture cases.
10. `State/Aggregator` wiring providers, evaluator, cache, backoff.
11. `/api/state` with ETag. `/api/config`. `/api/settings` (GET/POST with
    If-Match). `/api/discover`. `/health`.
12. Frontend shell (`index.php` HTML + `assets/app.css` design tokens, layout,
    dark/light, container queries).
13. Frontend fetcher (visibility + ETag + countdown + stale banner +
    per-item error rendering).
14. Status card + each element-type renderer + inline-SVG sparkline.
15. Onboarding overlay + login modal + session/CSRF wiring + auth UI in
    settings.
16. Settings: catalog tree (visibility + rename + thresholds + re-discover) +
    display order list (drag-reorder) + instance add/edit/remove flow with
    "Test & discover".
17. About modal, theme toggle, dynamic page title, favicon tint, a11y polish.
18. End-to-end smoke against real Beszel + UptimeRobot. Screenshots.
19. `README.md` — prerequisites, install, file permissions, Caddyfile, recovery,
    backup, screenshots.

Each step has a verification check (test run, manual flow, or live-API check)
before the next step starts.

---

## 20. Risks restated

- **Beszel `stats` JSON** is undocumented and stated to change in minor
  releases. Mitigation: defensive parser, captured fixtures with corrupted
  variants, per-element try/catch, info-level log on unknown keys.
- **Beszel collection list rules.** Migration snapshot shows `listRule: null`
  but docs show regular-user querying works. Confirmed during build step 9 on
  a live hub; user-assignment requirement documented in README.
- **UptimeRobot Free 10 req/min.** Server-side cache TTL ≥ 30s handles one
  instance comfortably. Documented for users on Free who add multiple instances.
- **JWT expiry mid-fetch (Beszel).** Provider re-auths once on 401 and retries.
