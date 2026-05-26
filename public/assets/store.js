import { useState, useEffect, useMemo } from 'htm/preact';

const STORAGE_KEY = 'simplestatus.prefs.v1';

const DEFAULTS = {
  theme:         'auto',
  accent:        'mint',
  density:       'regular',
  cardstyle:     'paper',
  mark:          'stripe',
  mode:          'detailed',
  sparklines:    true,
  summaryBar:    true,
  refreshInterval: 30,
};

// Keys persisted server-side as admin defaults (POST /api/appearance).
// refreshInterval stays local-only — it's a per-viewer concern, not a default.
const SERVER_KEYS = ['theme', 'accent', 'density', 'cardstyle', 'mark', 'mode', 'sparklines', 'summaryBar'];

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocal(local) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
  } catch { /* quota exceeded — ignore */ }
}

function resolveTheme(theme) {
  if (theme !== 'auto') return theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyPrefs(prefs) {
  const root = document.documentElement;
  root.setAttribute('data-theme',      resolveTheme(prefs.theme));
  root.setAttribute('data-accent',     prefs.accent);
  root.setAttribute('data-density',    prefs.density);
  root.setAttribute('data-cardstyle',  prefs.cardstyle);
  root.setAttribute('data-mark',       prefs.mark);
  root.setAttribute('data-mode',       prefs.mode);
  root.setAttribute('data-sparklines', String(!!prefs.sparklines));
}

/**
 * @param {object} serverDefaults  Appearance object from /api/config.appearance + refreshIntervalSec.
 * @param {boolean} authenticated  Admin session active?
 * @param {string} csrfToken       Required for POST /api/appearance.
 */
export function usePrefs(serverDefaults, authenticated, csrfToken) {
  // Local overrides — for unauthenticated viewers.
  const [local, setLocal] = useState(readLocal);
  // Mirror of server defaults so admin edits are reflected without a re-fetch.
  const [server, setServer] = useState(serverDefaults || {});

  // Sync server state when parent supplies a new /api/config payload.
  useEffect(() => {
    if (serverDefaults) setServer(serverDefaults);
  }, [serverDefaults]);

  // Resolved prefs:
  // - server-managed keys (theme/accent/…): canonical defaults when authed,
  //   layered with localStorage when not.
  // - non-server keys (e.g. refreshInterval): always overlay localStorage so
  //   admins still get per-viewer control over their own polling cadence etc.
  const prefs = useMemo(() => {
    const base = { ...DEFAULTS, ...server };
    if (!authenticated) {
      return { ...base, ...local };
    }
    const localNonServer = {};
    for (const k of Object.keys(local)) {
      if (!SERVER_KEYS.includes(k)) localNonServer[k] = local[k];
    }
    return { ...base, ...localNonServer };
  }, [server, local, authenticated]);

  useEffect(() => { applyPrefs(prefs); }, [prefs]);

  useEffect(() => {
    if (prefs.theme !== 'auto' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyPrefs(prefs);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [prefs.theme]);

  async function setPref(key, value) {
    // refreshInterval is always local — per-viewer cadence, not a default.
    if (authenticated && SERVER_KEYS.includes(key)) {
      // Optimistic: update server mirror immediately, POST in the background.
      setServer(prev => ({ ...prev, [key]: value }));
      try {
        const res = await fetch('/api/appearance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
          body: JSON.stringify({ [key]: value }),
        });
        if (!res.ok) throw new Error('save failed');
        const json = await res.json();
        if (json.ui) setServer(prev => ({ ...prev, ...json.ui }));
      } catch {
        // Revert on failure.
        setServer(prev => ({ ...prev, [key]: server[key] }));
      }
      return;
    }
    setLocal(prev => {
      const next = { ...prev, [key]: value };
      writeLocal(next);
      return next;
    });
  }

  return [prefs, setPref];
}
