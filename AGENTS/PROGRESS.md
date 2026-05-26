# Progress Log

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

