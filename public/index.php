<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/src/bootstrap.php';

sendSecurityHeaders();
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');

// Read site title from config (falls back gracefully before first-run setup)
$siteTitle = 'Status';
$settingsFile = dirname(__DIR__) . '/config/settings.json';
if (is_file($settingsFile)) {
    try {
        $cfg = json_decode((string) file_get_contents($settingsFile), true, 8, JSON_THROW_ON_ERROR);
        $rawTitle = $cfg['ui']['siteTitle'] ?? null;
        if (is_string($rawTitle) && $rawTitle !== '') {
            $siteTitle = htmlspecialchars($rawTitle, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        }
    } catch (\Throwable) {
        // silently fall back to default — config may not exist yet
    }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Status &middot; <?= $siteTitle ?></title>
  <link rel="stylesheet" href="/assets/app.css" />
  <link rel="icon" href='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="oklch(62%25 0.14 150)" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>' />
  <script type="importmap">
  {
    "imports": {
      "preact":       "/assets/vendor/preact.module.js",
      "preact/hooks": "/assets/vendor/preact-hooks.module.js",
      "htm/preact":   "/assets/vendor/htm-preact.module.js"
    }
  }
  </script>
</head>
<body>
  <div id="root"></div>
  <noscript>
    <p style="padding:2rem;font-family:sans-serif">
      JavaScript is required to view this status page.
    </p>
  </noscript>
  <script type="module" src="/assets/app.js"></script>
</body>
</html>
