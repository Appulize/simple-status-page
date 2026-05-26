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

## Next: Step 3 plan — see section below

