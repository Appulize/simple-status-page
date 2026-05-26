# simple-status-page

A fast, lightweight, self-hosted status page for servers and services.

**Status: in development — not ready for production use.**

## Requirements

- PHP 8.2+ with extensions: `curl`, `json`, `openssl`, `opcache`
- Web server: Caddy 2.7+ + PHP-FPM (see `Caddyfile.example`), or any server that routes requests to `public/index.php`
- Node.js 18+ (only for running `npm run vendor` to copy vendor files; not required on the server)

## Quick start

```sh
git clone https://github.com/yourorg/simple-status-page
cd simple-status-page

# Copy vendor JS files into public/assets/vendor/ (committed, but re-run after pulling)
npm run vendor

# Set permissions
chmod 700 config/ cache/ cache/sessions/ cache/throttle/

# Copy and edit the Caddy config
cp Caddyfile.example /etc/caddy/Caddyfile
# ... edit as needed, then reload Caddy

# Open in browser — first run forces password setup
```

## Providers

- **Beszel** — self-hosted server monitoring (PocketBase-based)
- **UptimeRobot** — external uptime checks (read-only API key)

## Configuration

Settings are stored in `config/settings.json` and managed entirely through the
settings UI. The file is created on first run.

### File permissions

```sh
chown -R www-data:www-data config/ cache/
chmod 700 config/ cache/ cache/sessions/ cache/throttle/
chmod 600 config/settings.json   # set after first write
```

### PHP opcache (recommended)

Add to `php.ini`:
```ini
opcache.enable=1
opcache.memory_consumption=64
opcache.max_accelerated_files=1000
```

## Browser support

Requires import map support: Chrome/Edge 89+, Safari 16.4+, Firefox 108+.

## License

MIT — see `LICENSE`.
