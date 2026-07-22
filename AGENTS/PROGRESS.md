# Progress Log

---

## 2026-07-22 — Production container packaging

**Deliverables:**
- Multi-stage production image with pinned frontend dependencies, Apache/PHP 8.4, required PHP extensions, clean-URL routing, health check, and persistent `/data` volume.
- Secure runtime-directory initialization and a local Compose definition.
- GitHub Actions release workflow that validates stable semver tags and publishes multi-architecture images to `maciekish/simple-status-page`.
- Docker deployment and release-tag documentation.

**Verification:** image builds successfully; 204 PHP tests pass under the target PHP 8.4 runtime; 21 Playwright tests pass and the credential-gated live-provider test skips; Compose and workflow YAML parse; container health, clean URL routing, security headers, persistent-directory ownership/modes, and the visible onboarding overlay were confirmed.

---

## 2026-05-26 — Step 1: Repo scaffold

**Deliverables shipped:**
- Full directory tree with `.gitkeep` markers (`src/`, `cache/`, `config/`, `tests/`, `bin/`, `public/api/`, `public/assets/vendor/`, etc.)
- `.gitignore` — excludes `config/settings.json`, `cache/state.json`, `cache/sessions/`, `cache/throttle/`, `node_modules/`
- `src/bootstrap.php` — PSR-4 autoloader (`App\` → `src/`), opaque error/exception handlers, session config, `sendSecurityHeaders()` function (CSP, HSTS conditional on HTTPS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- `public/index.php` — SPA shell: import map wired to `/assets/vendor/`, reads `siteTitle` from settings.json with graceful fallback, calls `sendSecurityHeaders()`, outputs `<div id="root">`
- `public/assets/app.css` and `app.js` stubs (prevent 404s)
- `public/assets/vendor/` — Preact 10.25.4 + HTM 3.1.1 ES module files (committed; copied by `npm run vendor`)
- `package.json` + `bin/vendor.mjs` — vendor script with fallback shim generation, writes version README
- `Caddyfile.example` — reference config with inline client-cert section commented out
- `README.md` — prerequisites, quick start, file permissions, opcache note, browser baseline
- `public/design-sample/` — design reference files moved here intact (browseable during development); originals removed from `public/` root

**Verification:** PHP syntax clean; all security headers present on every response; vendor files 200.

---

## 2026-05-26 — Step 2: CSS + Preact/HTM Frontend

**Deliverables shipped:**

`public/assets/app.css`
- Merged `design.css` + `cards.css` from design sample verbatim
- Added new utility classes to eliminate all static inline styles: `.switch`/`.switch-thumb` (toggle animation via `data-on`), `.auth-method-row`, `.onboard-icon`, `.hero-frac`, `.summarybar-wrap`, `.stack-legend i[data-key]` (per-key colour rules), `.modal--wide`/`.modal--md`, `.modal-note`, `.modal-actions`, `.auth-section-h`, `.card-title-inner`, `.card-foot-provider`, `.elements-row[data-cols]` (1/2/3 col variants), `.loading-grid`, `.cat-add-btn`, `.drawer-intro`, `.chip-state[data-severity]`
- **Bug fix:** `unknown` state chip colour changed from `--down-*` (red) to `--paused-*` (grey) per PLAN §2.3 ("unknown is never red")
- **Severity vocabulary fix:** `data-severity="degraded"` (not `"warn"`) used throughout, matching PLAN §4

`public/assets/icons.js` — `Icon` component; all SVG paths as named map; single import point

`public/assets/store.js` — `usePrefs()` hook; reads/writes `localStorage` key `simplestatus.prefs.v1`; `applyPrefs()` sets all `data-*` attributes on `<html>`; tracks system dark-mode changes when `theme='auto'`; prefs applied immediately before first render to prevent flash

`public/assets/components/elements.js` — `GaugeEl`, `CounterEl`, `UptimeEl`, `BooleanEl`, `TextEl`, `EventsEl`, `LinkEl`, `Sparkline`, `fmtRelative`, `fmtNum`, `fmtTime` — all Preact/HTM, no `window` globals

`public/assets/components/card.js` — `ItemCard`; severity vocabulary uses `degraded`/`down`; `isDown` no longer includes `state==="unknown"` (was a bug in design sample); severity chip uses `data-severity` + CSS instead of inline colours; `data-cols` attribute drives grid columns

`public/assets/components/overlays.js` — `SettingsDrawer`, `AppearanceTab` (prefs wired), `CatalogTab`/`OrderTab` stubs, `AuthTab`, `LoginModal`, `OnboardOverlay` (8-char minimum), `AboutModal`; all inline styles replaced with CSS classes; props renamed `prefs`/`setPref` instead of `t`/`setTweak`

`public/assets/app.js` — root app; `TweaksPanel`/`useTweaks` removed; fetches `/api/state` with ETag + interval polling; shows "Connecting…" on first load, "Could not reach" on error; RSS link dropped (PLAN §10.4); footer siteTitle left blank (TODO: wire from `/api/config`); `heroHeadline` uses `degraded` vocabulary; stale banner wired to `meta.freshness`

`tests/inline-style-check.sh` — greps for `style=` in JS; accepts only dynamic-width exceptions (stackbar/gauge/uptime `width: X%`) and button disabled opacity; exits non-zero on violations

`tests/css-class-check.sh` — extracts static `class="..."` literals from JS, verifies each token is in `app.css`; exits non-zero on missing

**Verification:** both checks pass (0 violations, 0 missing); all 10 asset URLs return 200; all 5 security headers present; PHP server `php -S localhost:8099 -t public` starts cleanly.

**Remaining:** frontend shows "Could not reach /api/state" — backend not yet built; siteTitle in footer blank; footer shows `© 2026` static year (dynamic year from `new Date()`, siteTitle pending `/api/config`).

---

---

## 2026-05-26 — Step 3: PHP Backend Foundation + Stub API

**Deliverables shipped:**

`src/Config/Store.php`
- Static `$path` set via `init()`; falls back to `config/settings.json` relative to project root if never called
- `read()` — returns defaults on missing file; on corrupt JSON logs error and returns last-known-good (cached in static `$lastKnown`) or defaults
- `write()` — acquires `LOCK_EX` on `.lock` file in same dir, writes to temp file, renames atomically; creates dir with 0700 if missing; cleans up temp on failure
- `isFirstRun()` — true if file missing or `auth.passwordHash` is empty/null
- `defaults()` — full skeleton matching PLAN §5 schema
- `init()` resets `$lastKnown` so test cases using different paths don't bleed into each other

`src/Config/Migrations.php` — seeds `schemaVersion: 1` if absent; scaffold for future migrations

`src/Util/Safe.php` — `str()` / `int()` / `float()` / `bool()` / `arr()` coercions with sane defaults; `get()` dot-notation nested read; `bool()` handles "true"/"yes"/"1" and "false"/"no"/"0" string variants

`src/Util/Log.php` — `info()` / `warn()` / `error()` via `error_log()`; formats as `[LEVEL] msg {key=json, ...}`

`src/Util/Time.php` — `now()` wraps `time()`; minimal, expandable

`src/Http/Request.php` — wraps superglobals; `header()` normalises to `HTTP_*` keys (special-cases CONTENT_TYPE/CONTENT_LENGTH); `body()` cached from `php://input`; `json()` / `post()` / `isJson()` / `bearerToken()` / `basicAuth()` / `ifNoneMatch()` / `host()`

`src/Http/Json.php` — `ok()` / `error()` / `notFound()` / `unauthorized()` / `methodNotAllowed()` / `notModified()` — all `never`; `ok()` accepts extra headers map for ETag etc.

`src/Http/Csrf.php` — `token()` generates and caches in `$_SESSION['csrf_token']`; `validate()` uses `hash_equals`

`public/api/health.php` — `GET /api/health` → `{ok: true, time: <unix>}`; accepts GET + HEAD

`public/api/config.php` — `GET /api/config` → public config payload; siteTitle falls back to HTTP_HOST; includes `firstRun` field; `Cache-Control: public, max-age=30`

`public/api/state.php` — `GET /api/state` → stub empty state; ETag computed from items+instances (not timestamp) so conditional requests work even on stub; 304 on If-None-Match match; `Cache-Control: no-store`

`public/router.php` — dev-server URL router (`php -S localhost:8099 -t public public/router.php`); rewrites clean URLs to `.php` files; production Caddy does not use this

`tests/run.php` — discovers and runs all `*Test.php` files; `check(bool, label)` helper; exits non-zero on failure

`tests/ConfigStoreTest.php` — 21 assertions covering missing-file defaults, round-trip write/read, corrupt-JSON fallback, `isFirstRun()` in all three states, `defaults()` key presence

`tests/UtilSafeTest.php` — 17 assertions covering all coercion methods and edge cases

`tests/HttpJsonTest.php` — 10 assertions verifying state and config payload shapes round-trip through JSON correctly

`config/settings.example.json` — credentials template for UptimeRobot + Beszel; copy to `settings.json` (gitignored) to test with real providers

**Bug fixed:** `sendSecurityHeaders()` had `script-src 'self'` with no allowance for inline scripts, blocking `<script type="importmap">`. Fixed by adding optional `$extraScriptSrc` parameter to the function, and computing the importmap SHA-256 hash dynamically in `index.php` from the same PHP variable used to output the content (so hash and output cannot drift).

**Verification:** `php tests/run.php` → 48/48 pass; both shell checks pass; all three endpoints return valid JSON; ETag + 304 on `/api/state` confirmed; browser renders "ALL SYSTEMS NORMAL · All services operational. · 0 items"; PHP error log clean.

**Dev server command:** `php -S localhost:8099 -t public public/router.php`

---

## 2026-05-26 — Step 4: Auth layer + first-run flow

**Deliverables shipped:**

`src/Auth/Password.php` — `hash()` / `verify()` wrappers around bcrypt

`src/Auth/Session.php` — `start()` / `isAuthenticated()` / `login()` (calls `session_regenerate_id(true)`) / `destroy()` (clears `$_SESSION`, expires cookie, calls `session_destroy()`)

`src/Auth/Token.php` — `verify(token, cfg)` using `hash_equals`; respects `methods.token.enabled` flag

`src/Auth/Throttle.php` — file-counter throttle in `cache/throttle/<sha256(ip)>`; MAX=5, WINDOW=300s; `isThrottled()` / `retryAfter()` / `recordFailure()` / `clear()`; creates `cache/throttle/` with 0700 on first write

`src/Auth/Authenticator.php` — checks all 4 auth methods in priority order (session → token → basic → clientCert); `requireAuth()` terminates with 401 if not authenticated

`public/api/auth.php` — `GET /api/auth` → `{authenticated, firstRun, csrfToken}`; starts session (generates CSRF token); `Cache-Control: private, no-store`

`public/api/login.php` — `POST /api/login` → throttle check (429 + `Retry-After`) → firstRun guard (403) → password verify → on fail: recordFailure then re-check throttle → on success: clear throttle + Session::login() + return `{authenticated, csrfToken}`

`public/api/logout.php` — `POST /api/logout` → `Session::destroy()` → `{ok: true}`; no CSRF required (attacker-forced-logout is minor nuisance, not security breach)

`public/api/onboard.php` — `POST /api/onboard` → firstRun guard (403) → length check ≥8 (400) → bcrypt hash → `Store::write()` → `Session::login()` → `{ok: true, csrfToken}`

**Frontend wiring:**

`public/assets/components/overlays.js` — `LoginModal` and `OnboardOverlay` now make real API calls; both show busy state, inline errors, and call `onSuccess(json)` on completion; removed inline `style=${{ opacity }}` from OnboardOverlay button (uses `.btn:disabled` CSS instead)

`public/assets/app.js` — fetches `/api/auth` on mount; auto-shows onboard overlay when `firstRun: true`; ESC blocked on onboard overlay; lock icon becomes unlock icon when authenticated (click to logout); `handleAuthSuccess` and `handleLogout` update auth state

`public/assets/icons.js` — added `unlock` icon (open padlock shackle)

`public/assets/app.css` — added `.btn:disabled { opacity: .35; cursor: not-allowed; }` and `.form-error { color: var(--down-ink); }`

**Verification (curl):** all 11 checks pass — auth before onboard (firstRun:true), onboard sets password + auto-login, auth-with-cookie (authenticated:true), login correct (200), auth-with-login-cookie, logout, auth-after-logout (authenticated:false), onboard-again (403), short-password (400), 5x wrong password (4×401 then 429 with Retry-After header), throttle persists (429).

**Tests:** 48/48 pass (no regressions).

**Next: Step 5 — Settings management API + UI**

---

## 2026-05-26 — Step 5: Real data pipeline (provider interface, state infra, providers, aggregator)

**Deliverables shipped:**

`src/Providers/Provider.php` — interface per PLAN §3. id/name/version/configSchema/validate/discover/fetch. Docblocks document the discovery node and normalized item shape.

`src/Providers/Registry.php` — static map `uptimerobot → UptimeRobot::class`, `beszel → Beszel::class`. `get(id)` throws `InvalidArgumentException` on unknown.

`src/Providers/README.md` — provider contract, stable-key rule, element vocabulary, mandatory `Safe::*` defensive parsing, fixture requirement (happy + corrupt).

`src/State/HttpClient.php` — thin cURL wrapper. Hardened per PLAN §9: 5s connect / 15s total, HTTP+HTTPS only, TLS verify on, no redirect-following. Throws `RuntimeException` on cURL failure. Returns `{body, status, headers}`.

`src/State/Cache.php` — file cache at `cache/state.json` with `schemaVersion: 1`, atomic write (temp + rename), `get(ttl) / getStale() / cachedAt() / set()`. TTL formula `max(5, min(10, refreshIntervalSec / 2))` exposed as `Cache::ttlFor()`.

`src/State/Backoff.php` — per-instance exponential backoff persisted to `cache/backoff.json`. Initial 30s, doubling, cap 300s. `recordSuccess()` clears the entry. Best-effort I/O, loss tolerable.

`src/State/Evaluator.php` — pure function. Defaults table (cpu 80/95, mem 80/95, disk 85/95, response_time 1000/5000, uptime 99/95). Per-element severity tagged (`warn|crit|null`). Worst-of across elements. Provider hint `_providerSeverityHint` lets Beszel mark a host as `down` even if all metrics look healthy. `state ≠ active` forces `severity = ok` and wipes per-element tints.

`src/Providers/UptimeRobot.php` — POST `https://api.uptimerobot.com/v2/getMonitors` with full param set (`response_times`, `custom_uptime_ratios=1-7-30-90`, `logs`). Pagination via `offset`. Status map: 2→active/ok, 8→degraded, 9→down, 0→paused, 1/default→unknown. Elements: counter `response_time` (avg + history, oldest-left), uptime windows (24h/7d/30d/90d), events from logs, link. HttpClient injected via constructor for test isolation.

`src/Providers/Beszel.php` — PocketBase REST. Auth flow: `POST /api/collections/users/auth-with-password` → cache token; on 401 re-auth once and retry. List systems (`perPage=200`), per-system `system_stats` (filter `system='X' && type='1m'`, `sort=-created`, `perPage=60`), per-system `system_details`. Stats blob parsed fully defensively against the captured `j2dcfdrz1h8tjz5` fixture: `cpu`, `mp` (mem%), `dp` (disk%), `b` ([rx, tx] throughput), `ni.{name}` ([rx_now, tx_now, rx_total, tx_total]). Sub-items: NICs (`{sys}::nic::{name}`) and extra filesystems (`{sys}::disk::{mount}`, defensive — none present in current fixture). Status map: up→active, down→active+hint, paused→paused, pending→unknown.

`src/State/Aggregator.php` — orchestrator. Cache-first; non-blocking `flock` on `cache/state.json.lock` for stampede prevention; serves stale cache when lock contended or regeneration throws. Per-instance try/catch: backoff cooldown skips, fetch failures synthesize unknown items + record failure. Items not returned by the provider (deleted upstream) get a placeholder. Display order applied cross-instance from `settings.displayOrder`. Evaluator runs last. ETag computed from items+instanceErrors and **stored inside `meta.etag`** so cached reads emit a stable identifier (a previous attempt regenerated the hash per request and mis-matched because `(object) []` vs `[]` encoding diverged across the cache round-trip).

`public/api/state.php` — replaces the stub. Calls `Aggregator::get()`, emits `meta.etag` as the `ETag` header, returns 304 on `If-None-Match` match. `Cache-Control: private, no-cache`.

`bin/seed_discovery.php` — one-off helper used during Sprint 5 verification: runs `discover()` on every configured instance and writes the resulting items list to `settings.json`. Sprint 6 replaces this with the proper `/api/discover` endpoint + UI.

`tests/EvaluatorTest.php` — 17 assertions: thresholds per kind, worst-of mixing warn+crit, paused/unknown override, uptime windows, provider hint.

`tests/UptimeRobotTest.php` — happy + corrupt fixtures (`tests/fixtures/uptimerobot/{monitors,monitors_corrupt}.json`). 14 assertions. Corrupt fixture covers: missing `response_times`, non-numeric `status`, missing `custom_uptime_ratio`, non-array `logs`, minimal monitor with only `id+friendly_name`.

`tests/BeszelTest.php` — happy + corrupt fixtures (`tests/fixtures/beszel/{systems,system_stats,system_stats_corrupt,system_details}.json`). 30 assertions. Test stubs HTTP via `Beszel::$fakeRoutes` (URL-fragment lookup). Corrupt fixture covers: missing `cpu` key, mangled `b` (string instead of array), mangled `ni.eth0` value, unknown top-level keys ignored, mid-history broken record.

**Bug fixed during sprint:**
- `tests/BeszelTest.php` shadowed the test runner's `$failed` global with a local boolean, breaking the failure counter even when all assertions passed. Renamed local to `$threw`.

**Live verification (vs. real UptimeRobot + Beszel):**
- `php bin/seed_discovery.php` → 12 UR monitors + 38 Beszel nodes (9 hosts + NICs).
- `curl /api/state` → HTTP 200, 50 items, freshness=fresh, ETag set.
- Second `curl /api/state -H "If-None-Match: <etag>"` → HTTP 304, empty body.
- `Cache-Control: private, no-cache` present on both responses.
- Backoff verified by killing UR during a request (timeout) → `cache/backoff.json` populated with the failing instance id and `nextAttemptAt`.
- 113/113 tests pass.

**Beszel access (PLAN §13.8 resolved):**
The Beszel hub now runs with the `SHARE_ALL_SYSTEMS` env var set, so any regular readonly user can list every system without per-record assignment. README to recommend `SHARE_ALL_SYSTEMS=true` in Sprint 6; per-user assignment remains an option for fine-grained access.

**Evaluator behaviour correction (UR severity):**
URL monitors must reflect *current* status, not historical uptime ratios — a monitor that's up right now shouldn't read "down" because of a 30-day-old outage. Fixed in two places:
- `Evaluator::evaluateUptime` now requires the element to carry explicit `thresholds.warn` / `thresholds.crit`. Without thresholds, uptime windows display but never drive severity.
- `UptimeRobot::mapStatus` now returns a `_providerSeverityHint` per status: 9 → down, 8 → degraded, 2/0/1 → null. The hint flows through the evaluator (already wired for Beszel) and pushes the card severity directly.

Verified live: 12 UR monitors → 11 `ok` (status=2), 1 `down` (status=9), 1 paused (status=0 → state=paused, severity ok). No false-positive downs from low 7d/30d ratios.

`tests/EvaluatorTest.php` updated: covers both the no-thresholds (severity untouched) and the opt-in (thresholds carried → worst-of windows) paths. 114/114 tests pass.

**Not in this sprint (per the sprint scope):**
- `GET/POST /api/settings`, `POST /api/discover`, Settings drawer wiring — Sprint 6.
- `/api/health` version/uptime fields — bundle into Sprint 6.

**Next: Step 6 — Settings management API + Discovery API + Catalog/DisplayOrder/Auth tab wiring.**

---


## 2026-05-26 — Pre-Sprint-6 firefighting + perf

Goal was Sprint 6 (Settings/Catalog APIs), but the user opened the page and nothing rendered past "Connecting…". Diverted to fix the root cause and the issues a working page surfaced.

**Bugs fixed:**
- Fragment syntax: `<>...</>` in `overlays.js` produced `createElement("")` in this htm-preact build (no Fragment translation). The throw happened inside Preact's microtask-scheduled render, surfacing as an unhandled Promise rejection. Replaced wrappers with plain top-level siblings — htm returns an array, Preact renders arrays from a component fine. (Committed earlier in 2bd2483.)
- Noscript inline-style → CSP `style-src` violation. Moved to `.noscript-msg` class. (2bd2483.)
- `fmtRelative(0)` rendering "20599d ago"; now returns "—" for falsy/non-positive timestamps. (2bd2483.)
- Beszel `discover()` returning all child nodes (interfaces, disks) as `visible: true` by default — added child-detection in `bin/seed_discovery.php` so children default hidden. Existing overrides preserved by id-merge; previously-discovered items that disappear are kept around as orphans so the Aggregator can flag them "missing from upstream" until an admin removes them. (2bd2483.)
- Aggregator caches the upstream `label` into `displayName` on first sight so removed-upstream items still render with a friendly name. (2bd2483.)

**Performance — committed in 892f6f4:**
- Stale-while-revalidate in `Aggregator::get()`: stale entries return instantly; `spawnBackgroundRegen()` forks `bin/regen_state.php` to refresh for the next request. First-paint after TTL expiry drops from ~5s to <100ms.
- `HttpClient::requestMulti()` (curl_multi). Beszel `fetch()` fans out per-system stats+details in parallel, and the redundant `statsHistory` call is removed (latestStats now derives from the same payload).

**Live appearance preview — committed in 892f6f4:**
- New `POST /api/appearance` (auth + CSRF, whitelist-validated). Admins edit canonical public-facing defaults; the `ui` block in settings.json is the source of truth.
- `usePrefs` now takes `(serverDefaults, authenticated, csrfToken)`. Server-managed keys (theme/accent/density/cardstyle/mark/mode/sparklines/summaryBar) are layered with per-viewer localStorage overrides for unauth viewers, or used canonically for authed admins. Non-server keys (e.g. refreshInterval) always overlay localStorage so admins still get per-viewer control of their own polling cadence.
- Reset-to-defaults button in Appearance tab for unauth viewers; contextual intro text per auth state.
- Refresh-interval segmented control (10/30/60/300s) added.
- Stale banner suppressed during normal SWR operation (age < refresh interval); a 2s quick re-fetch is scheduled when the response is stale so the bg-regen result appears without waiting for the next poll.
- Settings drawer scrim clears only when an Appearance setting is actively being previewed; re-blurs on tab switch. Dark-theme override sorted by selector specificity (`scrim.scrim--clear`).

**UX polish (892f6f4):**
- Hero `data-incident` flips true for degraded as well as down, so the headline reads in simple mode for degraded states.
- Pluralization fixed: "1 monitor is down" vs "N monitors are down".
- "service" → "monitor" everywhere user-visible (hero headline, section heading, card error banner).

**Tests:** 114/114 pass after all changes. `bash tests/css-class-check.sh` + `bash tests/inline-style-check.sh` clean.

**Sprint 6 still pending.** None of the planned Sprint 6 endpoints (`GET/POST /api/settings`, `POST /api/discover`, `POST /api/password`, `/api/providers`, token rotate, `/api/health` version/uptime) shipped yet, nor the Catalog/Order/Auth tab wiring. The Appearance work landed early as a vertical slice; Sprint 6's `POST /api/settings` will eventually subsume `/api/appearance`.

---

## 2026-05-27 — Step 6: Settings + Discovery APIs and drawer wiring

**Backend endpoints shipped:**
- `/api/health` — now `{ok, time, version, uptimeSec}`; `APP_VERSION` constant in `bootstrap.php`, uptime from `cache/started_at` mtime sentinel (first-touch on first health hit).
- `GET /api/settings` — auth-gated, returns full settings doc + `meta.mtime` + ETag (`"<mtime>"`). `Cache-Control: private, no-store`.
- `POST /api/settings` — auth + CSRF (session) OR bearer-exempt. Requires `If-Match: <mtime>`; 428 if missing, 409 with the current server doc embedded on stale match. Validation via the new `App\Config\SettingsValidator::validate($incoming, $current)` — required top-level keys, lockout guard (≥1 auth method enabled), `schemaVersion` + `passwordHash` server-controlled, empty bearer-token payload preserves prior token.
- `GET /api/providers` — auth-gated; returns Registry-introspected providers with `configSchema()` for the wizard.
- `POST /api/discover` — auth + CSRF. Accepts `{instanceId}` for a saved instance or `{provider, config}` for the wizard. Calls `validate()` then `discover()`; 502 with the upstream error inline on provider failure.
- `POST /api/password` — auth + CSRF. Verifies current, validates new (≥8), rehashes, destroys session (forces re-login).
- `POST /api/token/rotate` — auth + CSRF. `bin2hex(random_bytes(32))`, persists in `auth.methods.token.token`, returned once.

**Frontend (overlays.js rewritten end-to-end):**
- `SettingsDrawer` is now stateful when authenticated. On mount it GETs settings; it tracks `settings` (last server-committed view), `mtime`, and a `draftRef` mutable buffer.
- Two save paths:
  - `editLocal(mutator)` — local-only, batched in `draftRef`. Used by Catalog (visibility toggle, rename, rediscover-merge, remove instance). Flushed exactly once on tab change or drawer close via `flushDraft()`. Solves the race where rapid concurrent POSTs clobbered each other via stale If-Match.
  - `saveSettings(mutator)` — immediate POST. Used by Order tab (per drop), Auth tab toggles, Add-Instance wizard, change password.
- Conflict modal: 409 surfaces a Reload/Cancel modal; Reload replaces local state with server's current doc.
- Catalog tab: per-instance group, item-row with visibility checkbox + inline rename (commits on blur/Enter), Re-discover and Remove buttons.
- Display Order tab: HTML5 drag-and-drop on the flat list of visible items. Drop indicator is an `::before` accent line (no margin → no layout shift → no flicker near row midpoints).
- Auth tab: 4-method switches with last-method lockout guard (disabled tooltip), Bearer token Reveal/Copy/Rotate, client-cert header-name + allowed-subjects editor, change-password form (current + new + confirm, ≥8).
- Add-Instance wizard (3 steps): provider picker → config form (rendered from `configSchema`) → tested discovery + reviewable tree → save. Children default unchecked; parents default checked.

**Cache + perceived-latency fixes:**
- `Aggregator::get()` invalidates the cache when `settings.json` mtime > `cache.cachedAt`. Stale-while-revalidate is bypassed in that case so the user never sees a pre-save items list.
- Fast path: when settings changed but every currently-visible item is already in the cached items, `applyUserTransforms()` re-applies filter + rename + displayOrder + re-hashes the ETag without touching providers. Newly-visible items still trigger a full synchronous regen.
- App.js: settings save fires `onSaved` → bumps a `refreshNonce` (forces a no-`If-None-Match` re-fetch of `/api/state`) and sets `saving=true`. A `.loading-grid--saving` spinner replaces the grid until the next state response lands. Clears `saving` on the first successful fetch.

**Tests:**
- New `tests/SettingsApiTest.php` — `Store::mtime()` round-trip; validator missing-key errors, schemaVersion + passwordHash preservation, lockout guard, token preserve/rotate paths.
- New `tests/DiscoverApiTest.php` — Registry shape, configSchema integrity per provider, validate() pass/fail without upstream contact.
- Extended `tests/HttpJsonTest.php` with admin-only appearance field round-trip (accent / cardstyle / mark).
- 151/151 pass (was 117). `bash tests/inline-style-check.sh` + `bash tests/css-class-check.sh` clean. `node --check` parses both JS modules.

**UX bugs surfaced + fixed during smoke-test:**
- Aggregator returning stale cache via SWR even after settings change → fast-path + cache invalidation rewrite.
- Concurrent catalog toggles racing each other → batched local edits, flushed on tab change / drawer close.
- "Did it save?" anxiety after flush → `Saving and reloading…` spinner overlay until `/api/state` confirms.
- Drag-and-drop hover flicker near row midpoint → moved drop indicator to `::before` so layout doesn't shift.

**Files touched (estimate):**
- New: `public/api/{settings,providers,discover,password}.php`, `public/api/token/rotate.php`, `src/Config/SettingsValidator.php`, `tests/SettingsApiTest.php`, `tests/DiscoverApiTest.php`.
- Modified: `public/api/health.php`, `src/bootstrap.php` (APP_VERSION), `src/Config/Store.php` (mtime()), `src/State/Aggregator.php` (cache-invalidation + fast-path + applyUserTransforms), `public/assets/components/overlays.js` (full rewrite of admin tabs), `public/assets/app.js` (etagRef + refreshNonce + saving state), `public/assets/app.css` (catalog rename input, token row, cert editor, wizard, drag-row drop indicator, spinner), `tests/HttpJsonTest.php` (admin-only appearance assertions), `AGENTS.md` (rule 7a — manual smoke-test handoffs).

**Carry-over to Sprint 7:** see `AGENTS/STEP7-PLAN.md`.

---

## 2026-05-27 — E2E browser test suite (Playwright)

**Deliverables shipped:**

- `tests/e2e/` — Playwright suite running headless Chromium against an isolated PHP server (`php -S 127.0.0.1:8123 -t public public/router.php`) whose data root is redirected to `tests/e2e/.tmp/data/` via a new `SSP_DATA_ROOT` env hook. Tests never touch the dev `config/settings.json` or `cache/`.
- `SSP_DATA_ROOT` constant in `src/bootstrap.php` (env-driven, defaults to project root). 8 callsites updated: `Store`, `Cache`, `Aggregator`, `Backoff`, `Throttle`, `bootstrap` session path, `api/health.php`, `public/index.php`. All 151 PHP unit tests still pass.
- Helpers: `helpers/env.ts` (data-root reset + base URL), `helpers/seed.ts` (onboard/seedAuthedWithItems/seedPasswordOnly + cache seeder), `helpers/ui.ts` (openSettings/switchTab/closeSettings/loginThroughUI/pause), `helpers/shot.ts` (numbered screenshots per test).
- 19 specs covering every UI flow built so far:
  - 01 onboarding · 02 login/logout · 03 auth-gated tabs · 04 dashboard render (mixed severities)
  - 05 simple/detailed · 06 theme toggle · 07 viewer appearance prefs · 08 admin appearance defaults
  - 09 catalog visibility/rename · 10 remove instance · 11 wizard 502 path · 12 display-order drag
  - 13 auth lockout guard · 14 change password · 15 bearer token rotate · 16 concurrent edit 409
  - 17 about modal · 18 stale banner · 19 (optional) live Beszel discovery, skipped when `.env` lacks creds
- `tests/e2e/.env.example` (committed) + `tests/e2e/.env` (gitignored). dotenv-loaded.
- `package.json` scripts: `test:e2e`, `test:e2e:headed`, `test:e2e:ui`, `test:e2e:report`.
- `.gitignore`: `test-results/`, `playwright-report/`, `tests/e2e/.env`, `tests/e2e/.tmp/`.
- `README.md` — "Testing" section.
- `AGENTS.md` — new §9 ("Tests are part of done") mandating test review/update on non-trivial changes; existing self-improvement loop renumbered to §10.

**Notable gotchas resolved during the sprint:**
- Cookie isolation: `request` worker-fixture has its own jar; helpers must take `page.request` to share the browser context's cookies with `page.goto`.
- HTML5 drag-and-drop: Playwright's `dragTo()` doesn't reliably trigger the app's React handlers — used explicit `DragEvent` dispatch via `page.evaluate()` with a shared `DataTransfer`.
- Race between settings POST and the follow-up /api/state GET: dropped the second `waitForResponse` and let `expect().toHaveCount/toHaveText` auto-retry.
- Conflict-modal flow: handleClose unmounts the drawer before React commits the conflict state. Use tab-switch (which keeps the drawer mounted) to flush instead.
- `/api/config` has `Cache-Control: public, max-age=30`, so an admin appearance change isn't visible across an in-tab reload. Spec 06 tests the per-viewer (localStorage) path for reload persistence; spec 08 verifies the admin/server path without a reload.

**Verification:** `npm run test:e2e` → 19/19 pass in 41 s on the author's machine (Beszel creds in `.env`); 18/19 with skip on a fresh checkout. `php tests/run.php` → 151/151 still pass. HTML report at `playwright-report/`, numbered screenshots at `test-results/<test-name>/NN-label.png`.

---

## 2026-05-27 — Step 7: Threshold UI, About modal, title/favicon, a11y, README, tree-collapse

Closed the v1 gap to PLAN.md before a 1.0 cut. All planned items shipped.

**Step 7.1 — Threshold editing UI:**
- `src/Config/ThresholdValidator.php` — per-element-key bounds (cpu/mem/disk 0–100, response_time 0–300000, uptime 0–100), enforces warn ≤ crit (gauge/counter) or warn ≥ crit (uptime, where lower ratio is worse). Drops empty pairs + collapses empty objects. Rejects unknown element keys.
- `SettingsValidator` wires through `ThresholdValidator::validate($incoming['itemConfig'])` and rejects with 400 on violation.
- `Aggregator::applyThresholdOverrides()` merges `itemConfig.<instanceId:itemId>.thresholdOverrides.<elementKey>` into `element.thresholds` before evaluation (Evaluator already prefers explicit thresholds over its defaults table).
- `Aggregator::applyUserTransforms()` bails (returns null → forces full regen) if any item carries thresholdOverrides — the severity baked into cached items would otherwise be wrong.
- **UI:** Catalog row gets a sliders icon when the live state item has threshold-capable elements (gauge/counter/uptime). Click expands an inline subpanel with warn/crit inputs per element key, showing the server defaults as placeholders. Edits flow through `editLocal` (batched) like the rest of Catalog.
- **Tests:** new `tests/ThresholdValidatorTest.php` (24 assertions, including the SettingsValidator round-trip). New e2e spec `21-threshold-editing.spec.ts` covers the happy path + the 400-on-bad-ordering path.
- **Bug found during e2e:** PHP's `(object) []` (an empty PHP array) round-trips through JSON as a JS Array, not Object. Setting `arr['key']` on an Array works locally but JSON.stringify silently drops the named property. `setThresholdOverride` now normalises Array → Object whenever it touches the itemConfig sub-tree. Same hazard surfaces anywhere a default-empty container in `Store::defaults()` later gets keyed access — flagged for future map fields.

**Step 7.2 — About modal real content:**
- `/api/health` now also returns `schemaVersion` (from `Store::read()`) + `cacheAgeSec` (now − `Cache::cachedAt()` or null).
- About modal renders Version, Schema (`v<N>`), Items, Process uptime (formatted), and Cache rebuilt (relative). Source link points at `https://github.com/appulize/simple-status-page` with `target=_blank rel=noopener noreferrer`.

**Step 7.3 — Dynamic title + favicon tint:**
- `useDocumentTitle(summary)` rewrites `document.title` to `(N down) · Status · {siteTitle}` when `down > 0`, otherwise `Status · {siteTitle}`. Keyed on `down`/`degraded` and short-circuits on unchanged values to keep devtools quiet.
- `useFaviconTint(summary)` regenerates an SVG bolt favicon coloured by worst severity using the OKLCH constants from `app.css`. Uses `Blob` + `URL.createObjectURL`; revokes the prior URL each change to avoid leaks. URL changes each tint shift so browser favicon caches don't pin the old colour.

**Step 7.4 — Accessibility pass:**
- Hero `<section>` gains `role="status" aria-live="polite" aria-atomic="true"` so AT users hear severity transitions.
- Settings drawer tab strip is now `role="tablist"` with each tab `role="tab" aria-selected aria-current tabIndex={0|-1}`. Arrow-left / arrow-right / Home / End rotate focus; roving focus follows the active tab via a `useEffect` keyed on `tab` + a `focusOnTabChange` ref so click-to-switch doesn't steal focus from the content panel.
- `openOverlay` in App.js stashes the trigger element in `openerRef`; `closeOverlay` returns focus via `requestAnimationFrame` after the overlay unmounts. ESC handler and footer About link both route through these helpers.
- Login/Onboard modals' `autoFocus` already focuses the password input on open; verified the focus return path on close.

**Step 7.5 — README rewrite + dark screenshot:**
- Full rewrite of `README.md` per PLAN: features, requirements, quick-start, Caddy + permissions, providers (with explicit `SHARE_ALL_SYSTEMS` note for Beszel), updating, backup, recovery via clearing `auth.passwordHash`, file layout, testing.
- New `tests/e2e/specs/20-screenshot-generator.spec.ts` seeds a 6-card dataset (mix of operational/degraded/down/paused with realistic CPU/mem/response-time/uptime elements) and writes `docs/screenshots/dashboard-dark.png` (1280×986, ~95 KB). Dark theme pinned via `addInitScript` so `applyPrefs` runs with it on first paint.

**Step 7.6 — Per-viewer Catalog tree-expanded state:**
- `simplestatus.catalog.collapsed.v1` localStorage Set tracks collapsed instance groups. Each group header is a button with chevron + aria-expanded; toggling persists immediately. v1's "everything expanded every drawer open" is gone.

**Verification:**
- `php tests/run.php` → **175/175** pass (was 151; +24 from ThresholdValidatorTest).
- `npm run test:e2e` → **22/22** pass in ~47 s (was 19; +3: screenshot generator, two threshold-editing specs).
- `bash tests/inline-style-check.sh` + `bash tests/css-class-check.sh` clean.
- `node --check` clean for all JS modules.

**Files touched:**
- New: `src/Config/ThresholdValidator.php`, `tests/ThresholdValidatorTest.php`, `tests/e2e/specs/20-screenshot-generator.spec.ts`, `tests/e2e/specs/21-threshold-editing.spec.ts`, `docs/screenshots/dashboard-dark.png`.
- Modified: `src/Config/SettingsValidator.php` (thresholdOverrides plumbing), `src/State/Aggregator.php` (apply overrides + bail-on-fast-path), `public/api/health.php` (+schemaVersion +cacheAgeSec), `public/assets/app.js` (useDocumentTitle / useFaviconTint / openerRef / closeOverlay focus return / openOverlay), `public/assets/components/overlays.js` (CatalogTab collapse + thresholds subpanel, About modal rewrite, Drawer tab a11y, stateItems prop), `public/assets/icons.js` (sliders + chevron-down/right), `public/assets/app.css` (.cat-group-toggle + .cat-thresholds suite), `public/index.php` (unchanged), `tests/e2e/specs/17-about-modal.spec.ts` (disambiguated dd.mono locator), `README.md` (full rewrite).
- Deleted: `AGENTS/STEP7-PLAN.md` (plan executed).

**Bug worth remembering:** PHP `(object) []` → JSON `[]` → JS `Array`. Named-key access works in-memory but `JSON.stringify` drops the keys. Any frontend mutation of a default-empty container in `Store::defaults()` should `Array.isArray(x) ? {} : x` first. Currently affected: `itemConfig`, `displayOrder` (this one is intentionally an array). Future map-shaped fields (e.g. instance.config) follow the same pattern — server defaults need to be `(object) []` AND the JS writer needs to coerce.

---

## 2026-05-27 — Pre-1.0 hardening (post-PO/lead-dev review)

Senior PO and senior lead-dev did a v1 go/no-go review and returned a CONDITIONAL GO. This sprint closes every actionable item except the deliberately-deferred first-run-takeover (deemed acceptable: no admin = nothing to protect; admin can re-onboard by clearing `auth.passwordHash`).

**Security:**
- `POST /api/appearance` is now bearer-CSRF-exempt to match every other mutating endpoint. Token clients no longer get a spurious 403.
- Optimistic-locking on `/api/settings` switched from filesystem mtime (1-second granularity) to a SHA-256 content hash. Two saves in the same wall-clock second can no longer race past the If-Match check. `Store::version()` is the new accessor; `Store::mtime()` retained for the Aggregator's coarser cache-vs-settings comparison.
- New `App\Util\UrlGuard` runs before every `HttpClient::request` / `requestMulti`. Denies link-local (`169.254/16`), CGNAT (`100.64/10`), IPv4 multicast/reserved/broadcast/0.0.0.0/8, IPv6 link-local (`fe80::/10`), multicast (`ff00::/8`), ULA (`fc00::/7`), unspecified. RFC1918 + IPv4 loopback intentionally allowed — that's the primary self-hosted use case. DNS-rebinding residual risk documented in `SECURITY.md`.
- `Backoff::save()` now writes via temp + rename. Concurrent fg/bg workers can no longer leave a torn JSON.
- `Migrations::run()` hard-fails when on-disk `schemaVersion` exceeds `Migrations::CURRENT` instead of silently passing through. Sets the version when missing.
- Dev `public/router.php` resolves both static and PHP candidates through `realpath` and refuses anything outside the webroot.

**Frontend safety:**
- `LinkEl` now whitelists schemes (`http`, `https`, `mailto`, relative, fragment); anything else collapses to `#`. External http(s) links pick up `target="_blank" rel="noopener noreferrer"` and the external icon. Removed the old `preventDefault` hack that made provider links non-clickable.
- Settings → Auth → Client certificate shows a `form-warning` chip explaining the reverse-proxy header requirement before letting the admin enable it. New `.form-warning` CSS using the existing `--warn` token.
- Footer now shows `© YYYY · {siteTitle}` (threaded via `/api/config` → new `siteTitle` state in `app.js`).

**Release plumbing:**
- `APP_VERSION` bumped `0.1.0` → `1.0.0`. About modal / `/api/health` will now correctly self-report.
- New `CHANGELOG.md` distilled from sprints 1–7, leading with the 1.0 entry.
- New `SECURITY.md` — reporting contact, threat model, residual risks (DNS rebinding, public `/api/state`, client-cert header trust, first-run takeover).
- README gained a "Security" section pulling the three most operationally-relevant residual risks forward.

**Tests:**
- New `tests/AggregatorTest.php` (29 checks) + `tests/fixtures/FakeProvider.php`. Covers: empty cache → regen, fresh cache reuse, provider exception → instanceErrors + error items, missing-from-upstream → synthesized unknown placeholder, displayOrder ranking, threshold-override severity recompute via Evaluator, and three private-method paths exercised via Reflection — `applyUserTransforms` returns null on (a) any thresholdOverrides present, (b) newly-visible item not in cache, and (c) succeeds + filters when cache covers all visible items.
- `App\Providers\Registry::register()` added so tests can plug in a deterministic fake provider without monkey-patching.

**Verification:**
- `php tests/run.php` → **204/204** pass (was 175; +29 AggregatorTest).
- `npm run test:e2e` → **22/22** pass in 47 s.
- `bash tests/inline-style-check.sh` + `bash tests/css-class-check.sh` clean.
- `node --check` clean for all touched JS modules.

**Deliberately deferred (NOT a 1.0 blocker per user direction):**
- Unauthenticated first-run takeover. Acceptable: a blank-state instance has nothing to leak, and an admin who lost the race can clear `auth.passwordHash` to re-onboard. Documented in `SECURITY.md`.

---
