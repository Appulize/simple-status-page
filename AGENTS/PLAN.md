# Simple Status Page — Implementation Plan (v1)

Status: approved · Last revised: 2026-05-26

A fast, lightweight, gorgeous status page for self-hosted servers and services.
Public read view, authenticated settings, modular providers, resilient parsers.

---

## 1. Stack and deployment

- **Backend:** PHP 8.2+, no framework, no Composer. Manual PSR-4 autoloader (namespace prefix `App\`).
- **Frontend:** Preact + HTM, served as static ES modules via an import map. No bundler at runtime. No JSX (HTM gives JSX-like tagged template literals — no compile step). Total runtime: ~13 KB gzipped.
- **Vendoring:** dependencies declared in `package.json`. `npm run vendor` (`bin/vendor.mjs`) copies pinned `.module.js` files out of `node_modules/` into `public/assets/vendor/{name}-{version}.module.js` and copies LICENSE files to `public/assets/vendor/LICENSES/`. Vendor files are **committed** to the repo — deploys remain file-copy, no Node required on the server.
- **Storage:** `config/settings.json`. Atomic writes (`LOCK_EX` + temp + rename).
- **Server cache:** `cache/state.json` with stale-while-error fallback.
- **Sessions:** PHP sessions, save path overridden to `cache/sessions/`.
- **Reverse proxy:** Caddy + PHP-FPM. Reference `Caddyfile.example` ships in the repo.
- **PHP requirements:** opcache enabled (documented), cURL, json, openssl extensions.
- **Strict types:** `declare(strict_types=1);` in every PHP file. PSR-12 style.
- **Browser baseline:** import maps required → Chrome/Edge 89+, Safari 16.4+, Firefox 108+.

### File layout

```
public/                       Caddy webroot
  index.php                   front controller + SPA shell
  assets/
    app.css                   all styles (no inline)
    app.js                    entry; uses preact + htm via import map
    components/{topbar,hero,card,elements,sparkline,settings,login,onboard,about}.js
    store.js                  tiny reactive store + localStorage prefs
    icons.js                  inline SVG paths
    vendor/
      preact-10.x.x.module.js
      preact-hooks-10.x.x.module.js
      htm-3.x.x.module.js
      LICENSES/{preact,htm}.LICENSE
      README.md               pinned versions + integrity hashes + update flow
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
bin/
  vendor.mjs                  copies node_modules → public/assets/vendor/
AGENTS/PLAN.md
package.json                  Preact + HTM deps; "vendor" script
Caddyfile.example
README.md
LICENSE
```

---

## 2. Architectural pillars

### 2.1 Normalize on the server
Each provider's data is converted server-side into one normalized item shape.
The browser renders one kind of card regardless of source. Adding a provider
never touches frontend code.

### 2.2 Modular providers (forward-compatible from day one)
A small `Provider` interface. Each provider is one file in `src/Providers/`. A
`Registry` discovers them. Adding a provider = one new class + register call.

### 2.3 Two conceptually separate display axes
- **Severity** (metric-derived, computed): `ok` | `degraded` | `down`. Produced by
  threshold evaluation today; by user rules in v2.
- **State** (provider/operator concept): `active` | `paused` | `maintenance` | `unknown`.
  Always supplied by the provider.

**Display rule:** if `state ≠ active`, show the state pill and a muted card
treatment — independent of severity. Specifically:
- `paused` → silver pill, dim card, no red even if last severity was down.
- `maintenance` → silver pill with wrench icon, dim card.
- `unknown` → grey pill, faded card. **Never red.** An item awaiting first check
  is not down; it has no signal.

Otherwise (state = active) show severity (green / amber / red).

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
provider groups them internally and batches the underlying API calls.

---

## 4. Normalized item shape (rendered by the frontend)

```jsonc
{
  "instanceId": "uuid",
  "providerId": "beszel",
  "itemId": "sys_abc::disk::/var",
  "displayName": "/var disk",
  "state": "active" | "paused" | "maintenance" | "unknown",
  "severity": "ok" | "degraded" | "down",   // computed by server, never raw from provider
  "statusText": "Operational",
  "lastSeenAt": 1764100000,
  "parentId": null,                          // present in discovery only; absent at render in v1
  "elements": [ /* see below */ ],
  "error": null
}
```

`state`, `severity`, `statusText` are computed by the server's evaluator (§7).
The provider returns the raw state and the elements (with their default
thresholds); the evaluator computes severity.

### Element types (v1)

| `type`    | Shape                                                                                                                                            | Use cases                          |
|-----------|--------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------|
| `gauge`   | `{key, label, value, unit, max?, thresholds?: {warn?, crit?}, severity?: "warn"\|"crit"\|null, history?: {intervalSec, values[]}}`               | CPU %, RAM %, disk %               |
| `counter` | `{key, label, value, unit, thresholds?, severity?, history?}` — no `max`                                                                         | response_time ms, requests/s, p99  |
| `uptime`  | `{windows: [{label, ratio}]}` — arbitrary number of windows                                                                                      | 24h / 7d / 30d / 90d               |
| `boolean` | `{key, label, value, trueLabel?, falseLabel?}`                                                                                                   | "Passing", "Synced", "SSL valid"   |
| `text`    | `{rows: [{label, value, mono?: bool}]}`                                                                                                          | hostname, OS, commit SHA           |
| `events`  | `{items: [{t, title, severity: "info"\|"warn"\|"error", durationSec?, href?}]}`                                                                  | downtime log, deploys, incidents   |
| `link`    | `{label, href, external?: bool}`                                                                                                                 | "Open in Grafana"                  |

Note the two severity vocabularies are deliberate and distinct:
- **Item-level** `severity`: `ok | degraded | down` (computed card status).
- **Element-level** `severity`: `warn | crit | null` (one element exceeding a
  threshold contributes `warn → degraded`, `crit → down` to the item).

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
  "ui": {
    "siteTitle":          null,            // null → PHP_URL_HOST of the request
    "refreshIntervalSec": 30,              // admin-only; server cache TTL aligns
    "theme":              "auto",          // default; viewer may override (localStorage)
    "accent":             "mint",          // admin-only — site-wide brand
    "cardstyle":          "paper",         // admin-only — flat | paper | elev
    "mark":               "stripe",        // admin-only — stripe | dot
    "density":            "regular",       // default; viewer may override
    "mode":               "detailed",      // default; viewer may override — simple | detailed
    "sparklines":         true,            // default; viewer may override
    "summaryBar":         true             // default; viewer may override
  },
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
    { "instanceId": "uuid",       "itemId": "sys_abc" },
    { "instanceId": "uuid",       "itemId": "sys_abc::disk::/var" },
    { "instanceId": "other-uuid", "itemId": "monitor_42" }
  ],
  "itemConfig": {
    "<instanceId>:<itemId>": {
      "displayName": "/var disk",
      "thresholdOverrides": {
        // populated by v2 UI; v1 leaves empty and uses provider defaults from §7.1
      }
      // v2 also adds: customRules, evaluationMode, mutePeriods
    }
  }
}
```

`itemConfig` is a separate top-level table so it survives re-discovery and
shares one shape for parent and sub-items. `displayOrder` is flat and
cross-instance so users can interleave items from different providers.

---

## 6. Authentication

### 6.1 Public vs protected endpoints
**Public:** `/`, `/api/state`, `/api/config`, `/api/auth`, `/health`.
**Protected:** `/api/settings` (GET/POST), `/api/discover`, `/api/logout`.
**First-run only:** `/api/onboard`.

The SPA itself is always served; auth-gated tabs in the Settings drawer render
a login modal in place of their content when no session exists.

### 6.2 First-run onboarding
First-run = `config/settings.json` missing OR `auth.passwordHash` empty.

- `GET /api/auth` returns `{firstRun: true}`.
- SPA renders an onboarding overlay that forces an admin password before
  anything else.
- `POST /api/onboard {password}` writes the bcrypt hash, enables the `form`
  method (only). Status view is immediately public.
- **Password minimum: 8 characters.**

### 6.3 Four auth methods, all UI-configurable
1. **HTML form** (default after first-run). `POST /api/login {password}` →
   `password_verify` against `auth.passwordHash`, `session_regenerate_id(true)`,
   sets PHP session, returns CSRF token. Cookie flags: `HttpOnly`,
   `Secure` (when HTTPS), `SameSite=Lax`.
2. **HTTP Basic.** Uses the same `passwordHash`. PHP reads `PHP_AUTH_USER` /
   `PHP_AUTH_PW` and `password_verify`s. For `curl` / scripts.
3. **API key in header.** `Authorization: Bearer <token>`. Token
   `bin2hex(random_bytes(32))`. Compared with `hash_equals`.
4. **Client certificate (via Caddy).** Caddy validates the cert and forwards a
   header (default `X-Client-Cert-Subject`). UI holds an allowlist of subject
   DNs.

### 6.4 Auth tab UI (Settings drawer)
For each method: an enable toggle plus, when enabled, the method's controls.

- **HTML form** — toggle only. Sub-text: "HTML form against bcrypt hash."
  Marked as `default`. **Cannot be disabled if no other method is enabled.**
- **HTTP Basic** — toggle only. Sub-text: "Same password as form login."
- **API key** — toggle. When enabled, expand to show:
  - Token field, masked by default with a "Reveal" eye button.
  - **Rotate** button — generates a new token and immediately replaces the old
    one; shows the new value once with a copy button.
  - "Copy" button on the revealed value.
- **Client certificate** — toggle. When enabled, expand to show:
  - Header name input (default `X-Client-Cert-Subject`).
  - **Allowed subjects** — editable list. Each row = one subject DN string.
    "+ Add subject" appends a row. "×" removes a row. Empty list = no one
    matches, so the method effectively denies (clearly indicated).

**Lockout prevention:** the off-toggle on the last enabled method is disabled
with a tooltip "Enable another method first."

**Change password** section below the method list: current password + new
password (min 8) + confirm.

### 6.5 Auth check order on protected endpoints
1. Session (form login)
2. API token (if enabled)
3. HTTP Basic (if enabled)
4. Client cert (if enabled)

### 6.6 CSRF
Required (header `X-CSRF-Token`) on all state-changing POSTs from form/session
auth. Token-based (Bearer) auth is CSRF-exempt.

### 6.7 Brute-force throttle
File-counter throttle in `cache/throttle/<ip-hash>`: 5 failed attempts /
5 min / IP → 429 with `Retry-After`. Independent of Caddy/fail2ban.

### 6.8 Concurrent settings edits
`GET /api/settings` returns current `mtime` of `settings.json`. `POST` sends
`If-Match: <mtime>`; mismatch → 409 with the conflicting current value.

### 6.9 Recovery
Clear `auth.passwordHash` in `settings.json` (filesystem) → triggers
re-onboarding on next load. Documented in README and shown in the Login modal.

---

## 7. Severity evaluation (Option 2, v2-ready)

The evaluator always operates on a rule list internally. v1 synthesizes the
rule list from element thresholds. v2 will concatenate user `customRules`
without touching the evaluator.

### 7.1 Default thresholds per element kind

| element kind         | `warn` | `crit` |
|----------------------|--------|--------|
| `cpu` (%)            | 80     | 95     |
| `mem` (%)            | 80     | 95     |
| `disk` (%)           | 85     | 95     |
| `response_time` (ms) | 1000   | 5000   |
| `uptime` (% window)  | 99.0   | 95.0   |

Per-item overrides at `itemConfig.<key>.thresholdOverrides.<elementKey>` are
deep-merged (partial overrides allowed).

### 7.2 Algorithm

```
for each element with thresholds.warn → emit rule {key, >=, warn, degraded}
for each element with thresholds.crit → emit rule {key, >=, crit, down}

triggered          = rules matching current element values
itemSeverity       = max severity across triggered (worst-of; never first-match-wins)
providerSeverity   = map(state) → ok | degraded | down
finalSeverity      = max(providerSeverity, itemSeverity)

per element: set element.severity = "warn" | "crit" | null so the UI can tint individual values
```

### 7.3 v2 doors held open
- `itemConfig` reserves space for `customRules`, `evaluationMode`, `mutePeriods`.
- Severity tiers (`providerDefaults`, `instanceConfig`) can be added as new
  merge tiers.
- Element `severity` ships in the API today even without user-editable thresholds
  in v1 — load-bearing for v2 per-element rule displays.

### 7.4 Threshold editing UI — deferred to v2
**v1 does not ship a UI for editing thresholds.** Provider defaults from §7.1
are used as-is. The data model already supports per-item overrides
(`itemConfig.<key>.thresholdOverrides`); v2 adds the UI. The Catalog tab in v1
shows only visibility + rename per item.

---

## 8. API endpoints

```
GET  /api/state              public      normalized items array + meta; ETag, Cache-Control: private, no-cache
GET  /api/config             public      UI config (theme defaults, refresh interval, site title, accent, cardstyle, mark, item order)
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

Per-item failures appear as items with `error` set + `state: "unknown"`.

### `/api/config` response (public — feeds the SPA's initial render)

```jsonc
{
  "siteTitle": "infra.example.com",
  "refreshIntervalSec": 30,
  "appearance": {
    "theme": "auto", "accent": "mint", "cardstyle": "paper", "mark": "stripe",
    "density": "regular", "mode": "detailed", "sparklines": true, "summaryBar": true
  }
}
```

Admin-only appearance fields (`accent`, `cardstyle`, `mark`) ship in this
public payload so anonymous viewers get the chosen brand. Per-viewer fields
(`theme`, `density`, `mode`, `sparklines`, `summaryBar`) are defaults — the
client checks localStorage first and falls back to these.

---

## 9. State aggregation and caching

1. `/api/state` invoked → `Aggregator::get()`.
2. `Cache::get('state', ttl)` → return immediately if fresh.
3. **Cache stampede prevention.** `flock(LOCK_EX | LOCK_NB)` on
   `cache/state.json`. If acquired → regenerate. If not → another worker is
   regenerating; serve current cache without waiting.
4. Regeneration: loop instances → resolve provider → call
   `fetch(config, selectedItemIds)`. Per-instance try/catch; failures populate
   `instanceErrors`, items synthesized with `state: "unknown"` + `error`.
   Apply per-instance backoff (§11): instances in cooldown are skipped.
5. Apply visibility filter and `displayOrder` ordering.
6. Run `Evaluator` over the items to compute severities.
7. Write cache atomically; emit `ETag` (hash of payload).
8. **Stale-while-error.** If regeneration fails entirely, return the last cache
   with `meta.freshness = "stale"` + `staleSince`.

### Cache TTL
`ttl = max(5s, min(10s, refreshIntervalSec / 2))`.

### Outbound HTTP (per upstream request)
- `CURLOPT_CONNECTTIMEOUT = 5`, `CURLOPT_TIMEOUT = 15`
- `CURLOPT_PROTOCOLS = CURLPROTO_HTTP | CURLPROTO_HTTPS`
- `CURLOPT_SSL_VERIFYPEER = true`, `CURLOPT_FOLLOWLOCATION = false`

---

## 10. Frontend

### 10.1 Tech
- Preact + HTM via import map. Module sources under `public/assets/components/`,
  imported by `app.js`.
- One CSS file: `public/assets/app.css`. **No inline styles** (no `style={...}`
  prop, no `<style>{...}</style>` blocks). Strict CSP `style-src 'self'` stays.
- Sparklines: inline SVG, no charting library.
- No build step. `bin/vendor.mjs` only copies static module files.

### 10.2 Polling
- Default 30s, configurable 5–600s (admin-only).
- `document.visibilityState === 'visible'` gates polling.
- `If-None-Match` on every poll; 304 → no DOM work.
- Visible countdown to next refresh in the topbar.

### 10.3 Rendering
- Card grid keyed by `instanceId + itemId`. Only mutate elements that changed.
- Preact's `h()` API; HTM tagged template literals for readable markup.
- **XSS rule:** never inject untrusted strings via `innerHTML` / `dangerouslySetInnerHTML`.
  Default Preact rendering (text children) is safe.

### 10.4 Visual direction and chrome

Layout (top → bottom):

- **Topbar** (fixed top, glass background). Left: brand chip with bolt icon
  + `Status · {ui.siteTitle}`. Center: `Simple | Detailed` segmented toggle.
  Right: theme toggle (sun/moon), lock icon → login (or status indicator when
  authed), cog icon → settings, About chip with refresh countdown.
- **Hero section.** Eyebrow pill (`Incident in progress` / `Degraded performance`
  / `All systems normal`) + headline (`N services down` / `N services degraded` /
  `All services operational`) + summary stat row (Operational `n/total`,
  Degraded `n`, Down `n`, Paused `n`, Last update `relative`). Optional
  stacked-bar legend (toggleable via `summaryBar`).
- **Stale banner** (when `meta.freshness = "stale"`).
- **Section heading.** `Services · {count} items · refreshes every {interval}s`.
- **Card grid.** Element cards laid out per §4. Card chrome per §10.5.
- **Footer.** Copyright + site title · About · Health · JSON. (No RSS.)

Appearance customization (all live-applied):
- `theme` — auto / light / dark (per-viewer).
- `density` — cozy / regular / airy (per-viewer; changes card padding + grid columns).
- `cardstyle` — flat / paper / elev (admin-only; card surface treatment).
- `mark` — stripe / dot (admin-only; how non-ok cards stand out).
- `accent` — mint / citron / violet / coral / ink (admin-only; links + focus).
- `sparklines` — on / off (per-viewer; toggles inline sparkline rendering).
- `summaryBar` — on / off (per-viewer; toggles hero stackbar).
- `mode` — simple / detailed (per-viewer; see §10.7).

Design tokens are OKLCH; status colors remain fixed regardless of `accent`.
Status conveyed by color AND icon AND text (never color alone). Subtle motion
only; respects `prefers-reduced-motion`. Mobile-first; topbar collapses below
~520 px to brand + overflow menu containing the segmented toggle, theme, lock,
cog, about.

### 10.5 Card chrome
- Card head: severity dot + display name + statusText + state chip (when state ≠ active).
- Down banner inside body when `severity = down` and state = active (icon +
  short error).
- Paused / maintenance banner inside body when state = paused / maintenance.
- Body: grouped elements (gauges/counters cluster into a row; uptime, boolean,
  text, events, link each take their own row).
- Card foot: "Last seen Xs ago" + provider id (small, muted).

### 10.6 Settings UI — tabbed drawer

A single right-side drawer opened by the cog icon. Four tabs:

1. **Appearance** — always visible (anonymous viewers too):
   - Per-viewer controls (theme, density, mode, sparklines, summaryBar)
     persist to localStorage immediately. No save button.
   - When authed: a separate "Site defaults" subsection appears below with
     admin-only controls (default theme, accent, cardstyle, mark, refresh
     interval, site title). Saving uses `POST /api/settings`.
2. **Catalog** — auth-gated. Per-instance tree of discovered items with
   indent for hierarchy. Each row has a visibility checkbox + rename. Per
   instance: `Re-discover`, `Edit config`, `Remove` buttons. Footer: `+ Add
   instance` opens the add-instance flow.
3. **Display order** — auth-gated. Single flat draggable list of all
   currently-visible items in `displayOrder`. Drag rows anywhere (across
   instances). Drop persists immediately.
4. **Auth** — auth-gated. Per-method toggle + per-method controls (§6.4),
   change password.

Auth-gated tabs render an inline "Sign in to manage" panel with a password
field when no session exists.

### 10.7 Simple vs Detailed mode (per-viewer)

- **Simple mode.** Topbar + hero unchanged. The card grid is replaced by a
  flat list of one-line **status pills** per visible item: severity dot +
  display name + statusText + (state chip if state ≠ active). No metrics, no
  sparklines, no history, no text rows, no events, no booleans, no links.
  Compact and at-a-glance.
- **Detailed mode.** Topbar + hero + full element cards as described above.

Mode is per-viewer (localStorage). Admin sets the default.

### 10.8 Appearance settings storage split

**Per-viewer (localStorage under `simplestatus.prefs.v1`):**
- `theme`, `density`, `mode`, `sparklines`, `summaryBar`

**Admin default (server, `ui.*` in `settings.json`):**
- All of the above (used when the per-viewer key is absent)
- `accent`, `cardstyle`, `mark`, `refreshIntervalSec`, `siteTitle` (no
  per-viewer override; admin-only)

Boot sequence:
1. SPA fetches `/api/config` → admin defaults.
2. SPA reads `localStorage` → per-viewer overrides.
3. Effective config = per-viewer overrides over admin defaults.

A "Reset to site defaults" button in the Appearance tab clears the
localStorage key.

### 10.9 Add-instance flow

Triggered by `+ Add instance` in the Catalog tab.

1. **Provider picker** — dropdown of registered providers (Beszel,
   UptimeRobot, …).
2. **Config form** — rendered from chosen provider's `configSchema()`:
   field per declared input (text / secret / url / select). Inline help per
   field. "Display name" field for the instance.
3. **Test & discover** — `POST /api/discover` with `{ provider, config }`.
   Errors render inline. Success → show discovered tree.
4. **Review tree** — all items checked by default, hierarchy shown. User can
   uncheck unwanted items.
5. **Save** — `POST /api/settings` adds the instance + items + appends them to
   `displayOrder`. Drawer returns to Catalog tab.

### 10.10 Affordances
- **Stale indicator** — banner with "Last updated 2 min ago" when freshness = stale.
- **Empty / error states** — no instances → first-add CTA; per-instance failure
  → faded cards with hover-error tooltip; all failed → top banner.
- **Dynamic page title** — `(2 down) · Status · {siteTitle}`.
- **Favicon tint** by worst current severity (small SVG generated client-side).
- **Accessibility** — `aria-live="polite"` on the status region; visible focus
  rings; full keyboard nav for menu and settings; respects `prefers-reduced-motion`.
- **Time** — server emits Unix seconds; client renders relative ("12s ago")
  with absolute on hover in browser locale.

---

## 11. Resilient parsing (4-layer degradation)

Every layer catches, attaches an error, returns valid output. Failures never
cascade.

1. **Aggregator** wraps per-instance fetches. A dead instance returns its
   items with `state: "unknown"` + instance-level `error`.
2. **Provider `fetch`** wraps per-item parse. A malformed record yields a
   minimal `{id, displayName, state: "unknown", error}` item.
3. **Element parse** wraps per-element extraction. A missing/malformed `cpu`
   skips that element. Sibling elements still rendered.
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
- **Cache schema version** in the cache file; mismatch → treat as missing.
- **settings.json corruption.** Never auto-overwrite. Surface error in UI;
  preserve the file.
- **Per-instance backoff.** On failure, double the next-attempt delay (cap 5
  min). On success, reset.
- **Test fixtures.** Captured real responses + corrupted/mutated copies under
  `tests/fixtures/`. `tests/run.php` exercises parsers against both.

---

## 12. Provider — UptimeRobot (v1)

- **Endpoint:** `POST https://api.uptimerobot.com/v2/getMonitors`
  (`Content-Type: application/x-www-form-urlencoded`).
- **Auth:** read-only API key in `api_key` body field.
- **Server-side proxy** (not browser-direct). Reasons: shared cache, key off
  the wire, single polling code path.
- **Params:** `format=json`, `response_times=1`, `response_times_limit=60`,
  `response_times_average=1`, `custom_uptime_ratios=1-7-30-90`, `logs=1`,
  `logs_limit=10`.
- **Pagination:** `offset` / `limit` (max 50); loop until `pagination.total`.
- **Rate limits:** Free 10 req/min, Pro `monitors * 2` (max 5000). Server
  cache TTL respects this. `X-RateLimit-*` headers logged.

### Mapping
Monitor `status` → state + severity:
- 2 (up) → state: active, severity: ok
- 8 (seems down) → state: active, severity: degraded
- 9 (down) → state: active, severity: down
- 0 (paused) → state: paused
- 1 (not checked yet) → state: unknown

### Discovery
Each monitor as a flat node: `{id, label=friendly_name, kind="monitor", parentId=null, hints=type+url}`.

### Fetch
Per monitor → normalized item:
- `state` per mapping above; severity computed by the evaluator.
- `elements`:
  - `counter` `response_time` (ms) — current + history from `response_times`.
  - `uptime` with windows derived from `custom_uptime_ratios=1-7-30-90`.
  - `events` from `logs` (down/up/paused entries).
  - `link` to the monitored URL.

---

## 13. Provider — Beszel (v1)

Beszel hub = PocketBase. Official REST API: `https://beszel.dev/guide/rest-api`.

### 13.1 Auth
- Authenticate as a **regular user** (NOT superuser).
- `POST {hubUrl}/api/collections/users/auth-with-password` with
  `{identity, password}` → returns `{token, record}`.
- Send `Authorization: <token>` (PocketBase format; no "Bearer" prefix).
- **JWT lifecycle.** Cache the token in-process for the request; on 401,
  re-auth once and retry. Never persist.

### 13.2 Endpoints used
- **List systems:** `GET {hubUrl}/api/collections/systems/records?perPage=200`
  Fields: `id`, `name`, `status` (up|down|paused|pending), `host`, `port`,
  `info` (json).
- **System details:** `GET {hubUrl}/api/collections/system_details/records?filter=system='{id}'&perPage=1`
  Fields: `hostname`, `os_name`, `kernel`, `cpu`, `arch`, `cores`, `threads`,
  `memory`, `podman`.
- **Latest stats + sparkline history:**
  `GET {hubUrl}/api/collections/system_stats/records?filter=system='{id}'%20%26%26%20type='1m'&sort=-created&perPage=60`
  Fields: `id`, `system`, `stats` (json), `type` (1m|10m|20m|120m|480m),
  `created`, `updated`.

### 13.3 Status mapping
- `up` → state: active (severity from evaluator).
- `down` → state: active, server attaches a hint that the evaluator uses to
  set severity = down even when no element thresholds are tripped.
- `paused` → state: paused.
- `pending` → state: unknown.

### 13.4 Stats blob — undocumented, defensive
Beszel's `stats` JSON shape is undocumented and stated to change in minor
releases. The provider parses defensively (§11). On first wiring, current keys
are captured into `tests/fixtures/beszel/` and the parser is tested against
both happy and corrupted variants.

Initial best-effort mapping (verified live during build step 9):
- `cpu` → `gauge` `cpu` (%, max 100)
- `mem` / `memUsed` / `memPct` → `gauge` `mem` (%, max 100)
- `disk` / `diskUsed` / `diskPct` → `gauge` `disk` (%, max 100); per-disk
  entries become sub-items at discovery time
- `net.rx` / `net.tx` → `counter` `net_rx` / `net_tx` (KB/s or MB/s)
- Unknown keys: ignored (logged at info)

### 13.5 Discovery
Auth → list systems → for each system fetch one `system_stats` record and
`system_details` to enumerate sub-items (disks, network interfaces, sensors,
containers). Return flat tree. Cost: `1 + 2N` API calls — only on user-
triggered discovery.

### 13.6 Fetch
Group requested `itemIds` by parent system. One `system_stats` query per
system covers all that system's selected sub-items. One `system_details` per
system for the `text` element.

### 13.7 Config schema
- `url` (https URL, required)
- `username` (email, required)
- `password` (secret, required)

### 13.8 Live-verification notes
Beszel migration snapshot shows `listRule: null` (superuser-only) but the
docs show regular-user querying works. Confirm on a live hub during
integration; document the systems-to-users assignment requirement in README.

---

## 14. Security

- **SSRF.** Outbound HTTP only to user-configured URLs. cURL restricted to
  HTTP/HTTPS, TLS verify on, redirects disabled, timeouts set. No private-IP
  denylist (legitimate localhost/LAN targets); risk documented in settings UI.
- **Brute-force throttle.** §6.7.
- **CSRF.** §6.6.
- **Session fixation.** `session_regenerate_id(true)` on every login.
- **Strict CSP.** `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`.
  **No inline styles, no inline scripts** — enforced in CSS pipeline (style-src
  stays strict).
- **Other security headers.** `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
  `Strict-Transport-Security: max-age=31536000; includeSubDomains` when HTTPS.
- **Cache-Control: private, no-store** on `/api/settings*`, `/api/discover`,
  `/api/auth`.
- **Error handler.** Production returns generic 500 body with opaque incident
  id; full detail goes to FPM error log.
- **XSS rule.** §10.3.
- **Secrets in GET /api/settings.** Returned plaintext to the authed admin
  (single tenant). UI masks them by default with a "reveal" toggle. Beszel
  JWT cached in-process only.
- **File permissions.** `config/` and `cache/` 0700, files 0600, owned by FPM
  user. Install docs cover it.
- **Token compare** `hash_equals`. **Password compare** `password_verify`.
- **Cookie flags.** `HttpOnly`, `Secure` (HTTPS), `SameSite=Lax`.

---

## 15. Performance

- **Cache stampede prevention** via `flock` on regeneration. §9.
- **Outbound timeouts** 5s connect / 15s total.
- **Parallel provider fetches.** v1 serial; `curl_multi_*` only if measured need.
- **Compression.** Caddy gzip/zstd, documented in `Caddyfile.example`.
- **Opcache** enabled, documented in README.
- **DOM update strategy.** Card grid keyed by item id; only mutate elements
  that changed across polls. No full re-render per poll.
- **ETag on `/api/state`.** Client sends `If-None-Match`; 304 saves bandwidth
  and DOM work.

---

## 16. Maintainability

- **Strict types** everywhere. PSR-12.
- **No globals.** `Http\Request` wraps `$_SERVER` / `$_GET` / `$_POST` / headers.
- **`Util\Log`** wraps `error_log` with levels (info/warn/error). Never logs secrets.
- **Schema versioning.** `settings.json` carries `schemaVersion`. `Config\Migrations`
  runs migrations on read. v1 = 1.
- **Provider versioning.** Each provider has a `VERSION` constant. Each instance
  stores `providerVersion`. Per-provider migration callback runs on read when stored < current.
- **Provider contract doc.** `src/Providers/README.md` — interface, stable-key
  rule, defensive-parsing rule, normalized shape. Required reading.
- **Tests.** `tests/run.php` — no-Composer runner. Asserts against fixtures
  (happy path + corrupted variants). Exits non-zero on failure.
- **Vendor pipeline.** `package.json` pins deps; `npm install && npm run vendor`
  refreshes `public/assets/vendor/`. Committed artifacts. README documents the
  update flow; `vendor.mjs` writes a manifest with SHA-256s per file so
  tampering is detectable.

---

## 17. Operational

- **Health endpoint.** `GET /health` → `{status: "ok", version, uptimeSec}`.
- **Logging.** FPM error log (PHP `error_log`). All upstream failures go here
  with instance id + provider id + a redacted error.
- **Backups.** `settings.json` is the only durable state.
- **Upgrade path.** Replace files; schema migrations run on first read. For
  vendor refresh: `npm install && npm run vendor && git commit`.
- **Time.** Server UTC internally; client renders in browser locale.
- **No instances configured.** Main view shows empty-state CTA.

---

## 18. Out of scope for v1 (deliberately)

- i18n (English only)
- Email / webhook alerts (status page is not a notifier)
- Historical incident log (a future provider could expose this)
- Multi-user accounts (single admin, single tenant)
- Pull-to-refresh on mobile (visibility-based auto-refresh covers it)
- `curl_multi` parallel provider fetches
- Threshold editing UI (data model ready; v2 ships the editor)
- Rule editor (v2)
- Per-instance and per-provider threshold defaults (item-level only in v1)
- Container / Docker stats (parser handles them if Beszel returns them, but
  not first-class in v1 settings UI)
- RSS / Atom feed of state transitions

---

## 19. Build order

1. Repo scaffold + autoloader + `Caddyfile.example` + `public/index.php` front
   controller + error handler + security headers + strict CSP.
2. **Vendor pipeline:** `package.json` declaring Preact + HTM. `bin/vendor.mjs`
   copies module files into `public/assets/vendor/` with version-pinned
   filenames + LICENSE files + SHA-256 manifest. Import map in `index.php`.
   Commit vendor artifacts.
3. `Config/Store` (atomic JSON write, corruption-safe read) + `Config/Migrations` skeleton.
4. `Util/Safe`, `Util/Log`, `Http/Request`, `Http/Json`, `Http/Csrf`.
5. `Auth/*` — Password, Token, Session, Throttle. CSRF. First-run detection.
6. `/api/auth`, `/api/login`, `/api/logout`, `/api/onboard`. Login throttle wired.
7. `Providers/Provider` interface + `Registry`. `Providers/README.md`.
8. `State/HttpClient` (hardened cURL). `State/Backoff`. `State/Cache` (file TTL
   + stampede flock + stale-while-error). `State/Evaluator`.
9. `Providers/UptimeRobot` end-to-end. Fixtures captured. Parser tests.
10. `Providers/Beszel` end-to-end against a live hub. Fixtures captured. `stats`
    keys pinned. Parser tests including corrupted-fixture cases.
11. `State/Aggregator` wiring providers, evaluator, cache, backoff.
12. `/api/state` with ETag. `/api/config`. `/api/settings` (GET/POST with
    If-Match). `/api/discover`. `/health`.
13. Frontend shell: `index.php` HTML with import map + `assets/app.css` design
    tokens + topbar + footer + hero + grid layout + responsive collapse.
14. Frontend store + fetcher (visibility, ETag, countdown, stale banner,
    per-item error rendering) + localStorage prefs.
15. Status card + each element-type renderer + inline-SVG sparkline.
16. Simple vs Detailed mode renderer (one-line pills vs full cards).
17. Onboarding overlay + login modal + session/CSRF wiring + auth-gated tab
    inline login.
18. Settings drawer with 4 tabs:
    - Appearance (per-viewer + admin-default subsections, anonymous-friendly)
    - Catalog (visibility + rename + re-discover + add/edit/remove instance + add-instance flow)
    - Display order (drag-reorder, persists immediately)
    - Auth (4 methods incl. token rotate, client-cert allowlist editor, lockout guard, change password)
19. About modal + theme toggle + dynamic page title + favicon tint + a11y polish.
20. End-to-end smoke against real Beszel + UptimeRobot. Screenshots.
21. `README.md` — prerequisites, install (`npm install && npm run vendor`),
    file permissions, Caddyfile, recovery, backup, screenshots.

Each step has a verification check before the next.

---

## 20. Risks restated

- **Beszel `stats` JSON** is undocumented and stated to change in minor
  releases. Mitigation: defensive parser, captured fixtures with corrupted
  variants, per-element try/catch, info-level log on unknown keys.
- **Beszel collection list rules.** Migration snapshot shows `listRule: null`
  but docs show regular-user querying works. Confirmed during build step 10 on
  a live hub; user-assignment requirement documented in README.
- **UptimeRobot Free 10 req/min.** Server-side cache TTL ≥ 30s handles one
  instance. Documented for users on Free who add multiple instances.
- **JWT expiry mid-fetch (Beszel).** Provider re-auths once on 401 and retries.
- **Browser baseline.** Import maps need Chrome/Edge 89+, Safari 16.4+,
  Firefox 108+. Older browsers see no app. Acceptable for self-hosted
  infra-monitoring; documented in README.
