import { useState, useEffect } from 'htm/preact';

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

function readPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function writePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
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

export function usePrefs() {
  const [prefs, setPrefsState] = useState(readPrefs);

  useEffect(() => {
    applyPrefs(prefs);
  }, [prefs]);

  // Track system dark-mode changes when theme is 'auto'
  useEffect(() => {
    if (prefs.theme !== 'auto' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyPrefs(prefs);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [prefs.theme]);

  function setPref(key, value) {
    setPrefsState(prev => {
      const next = { ...prev, [key]: value };
      writePrefs(next);
      return next;
    });
  }

  return [prefs, setPref];
}
