# Security policy

## Reporting a vulnerability

Please report security issues privately by email to **maciej@swic.name**.
Include a description, reproduction steps, and impact assessment. We aim to
acknowledge within 72 hours and ship a fix on the next minor release for
medium-severity issues; critical issues get an out-of-band patch.

Please do not file public issues for unfixed vulnerabilities.

## Threat model

simple-status-page is intended to be deployed behind a reverse proxy (Caddy,
nginx) on a host the operator controls. The threat model assumes:

- The host running PHP-FPM is trusted; admins have shell access there anyway.
- The reverse proxy terminates TLS and enforces transport security.
- `config/settings.json` is readable only by the web user. It contains the
  bcrypt password hash and any provider credentials the admin entered. Treat
  it like a secret.

The application defends against:

- **CSRF** on every mutating endpoint (session and form auth). Bearer-token
  auth is CSRF-exempt because token presence implies a non-browser caller.
- **XSS:** `script-src 'self'` plus a single hashed inline importmap; no
  third-party scripts; no `innerHTML`. Provider-supplied link URLs are
  restricted to `http(s)` / `mailto` schemes.
- **Clickjacking:** `X-Frame-Options: DENY` and `frame-ancestors 'none'`.
- **Login brute force:** per-IP throttle with exponential backoff; lockout
  guard on settings prevents disabling every auth method.
- **SSRF against cloud metadata services:** outbound HTTP requests reject
  link-local (`169.254/16`), CGNAT (`100.64/10`), IPv4 multicast / reserved,
  IPv6 link-local / multicast / ULA, and unspecified addresses. RFC1918 and
  loopback are intentionally allowed — the core use case is monitoring
  self-hosted infrastructure on private networks.

## Residual risks the operator should know about

- **DNS rebinding** can swap the resolved IP between our pre-check and the
  curl call. The SSRF guard is best-effort, not a custom resolver. Mitigated
  by the admin-only attack surface; if you're worried, run the app on a
  network without access to cloud metadata services.
- **Public `/api/state`:** the rendered status payload (hostnames, OS, kernel
  versions, live system stats) is intentionally available without
  authentication — that is the point of a status page. Do not display data
  on it that you would not put on a public wall poster.
- **Client-certificate auth** trusts a request header. It MUST be paired with
  a reverse-proxy directive such as
  `header_up X-Client-Cert-Subject {tls_client_subject}` so that the header
  cannot be spoofed by a direct connection. See `Caddyfile.example`. The
  settings UI shows a warning when this method is enabled.
- **First-run onboarding** is unauthenticated by design: whoever reaches a
  fresh deploy first sets the admin password. Walk straight to the URL after
  starting the service, or block external access until the password is set.
  An admin who loses access can re-onboard by clearing `auth.passwordHash`
  in `config/settings.json` (see the README "Recovery" section).

## Cryptography

- Passwords hashed with `password_hash(PASSWORD_BCRYPT)` (cost 12). Verified
  with `password_verify()`. No salt management.
- CSRF tokens are 32-byte values from `random_bytes()`, compared with
  `hash_equals()`.
- Bearer tokens are 32-byte URL-safe values from `random_bytes()`.

## Supported versions

The latest 1.x release is supported. Older minors receive critical security
fixes only.
