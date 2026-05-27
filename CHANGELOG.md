# Changelog

All notable changes to simple-status-page are recorded here.
The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] — 2026-05-27

First production release.

### Highlights
- **Providers built in:** Beszel (self-hosted server metrics) and UptimeRobot (external uptime checks). Both read-only.
- **One-click onboarding:** first request prompts for an admin password; everything else is configured through the in-page settings drawer.
- **Discovery wizard:** add an instance by picking a provider, entering credentials, choosing which items to show.
- **Severity model:** per-element thresholds (CPU / memory / disk / response-time / uptime windows) roll up into per-card severity, then into the page-level hero. Per-item threshold overrides editable from the Catalog tab.
- **Live appearance:** admin-set defaults (theme, accent, density, card style, summary bar, sparklines) layer with per-viewer overrides in localStorage.
- **4 auth methods:** session form, HTTP Basic, Bearer token (CSRF-exempt), Caddy-validated client certificates. Last-method lockout guard prevents an admin from disabling every method.
- **Stale-while-revalidate** state pipeline with per-instance exponential backoff; provider outages don't blank the page.
- **CSP-strict** (`script-src 'self'` + a single hashed inline import map); no third-party JS, no telemetry.
- **Accessibility:** hero is a polite live region, drawer tabs are a roving-focus tablist, overlays return focus to the trigger on close.
- **Dynamic browser title** `(N down) · Status · {site title}` and SVG favicon tinted by worst severity.

### Security hardening
- `POST /api/appearance` now CSRF-exempt for bearer-token auth, matching every other mutating endpoint.
- Optimistic-concurrency token on `/api/settings` switched from filesystem mtime (1-second granularity) to a SHA-256 content hash, eliminating same-second write races.
- HTTP client now refuses URLs that resolve to link-local (`169.254/16`), CGNAT (`100.64/10`), IPv4 multicast/reserved, IPv6 link-local / multicast / ULA, and unspecified addresses, mitigating SSRF against cloud metadata services. RFC1918 and loopback remain allowed (legitimate for self-hosted monitoring).
- `Backoff::save()` now writes atomically (temp + rename); torn writes under concurrent regen workers are no longer possible.
- `settings.json` schema migrations now hard-fail when the on-disk version is newer than this codebase understands, instead of silently dropping fields.
- Dev `public/router.php` resolves paths via `realpath` and refuses requests that escape the webroot.
- Provider-supplied URLs rendered in `LinkEl` are restricted to `http://`, `https://`, and `mailto:` schemes; external links pick up `rel="noopener noreferrer" target="_blank"`.
- Settings UI now warns prominently when enabling the client-certificate auth method that a reverse-proxy `header_up` is required to prevent header spoofing.

### Tests
- 204 PHP unit tests (`php tests/run.php`), 22 Playwright e2e specs (`npm run test:e2e`).
- New `AggregatorTest` covers the regen → cache → fast-path pipeline, displayOrder ranking, threshold-override severity recompute, and the missing-item placeholder branch.
