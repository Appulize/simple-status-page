import { html, render, useState, useEffect, useMemo } from 'htm/preact';
import { Icon } from '/assets/icons.js';
import { usePrefs, applyPrefs } from '/assets/store.js';
import { fmtRelative } from '/assets/components/elements.js';
import { ItemCard } from '/assets/components/card.js';
import { SettingsDrawer, LoginModal, OnboardOverlay, AboutModal } from '/assets/components/overlays.js';

// Apply prefs immediately before first render to prevent flash
applyPrefs((() => {
  try { return { theme:'auto',accent:'mint',density:'regular',cardstyle:'paper',mark:'stripe',mode:'detailed',sparklines:true,summaryBar:true,
    ...JSON.parse(localStorage.getItem('simplestatus.prefs.v1') || '{}') }; } catch { return {}; }
})());

function severitySummary(items) {
  const c = { ok: 0, degraded: 0, down: 0, paused: 0, total: items.length || 1 };
  for (const it of items) {
    if (it.state === 'paused' || it.state === 'maintenance') c.paused++;
    else if (it.severity === 'down')     c.down++;
    else if (it.severity === 'degraded') c.degraded++;
    else                                 c.ok++;
  }
  return c;
}

function heroHeadline(s) {
  if (s.down > 0) {
    const plural = s.down !== 1;
    return { tone: 'down', text: html`${s.down} monitor${plural ? 's' : ''} <em>${plural ? 'are' : 'is'} down.</em>` };
  }
  if (s.degraded > 0) {
    const plural = s.degraded !== 1;
    return { tone: 'warn', text: html`${s.degraded} monitor${plural ? 's' : ''} <em>${plural ? 'are' : 'is'} degraded.</em>` };
  }
  return { tone: 'ok', text: html`All monitors <em>operational.</em>` };
}

function Countdown({ seconds }) {
  const [n, setN] = useState(seconds);
  useEffect(() => {
    setN(seconds);
    const id = setInterval(() => setN(v => (v <= 1 ? seconds : v - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds]);
  return html`<span>${String(n).padStart(2, '0')}s</span>`;
}

function resolveTheme(t) {
  if (t !== 'auto') return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function App() {
  const [overlay, setOverlay] = useState(null);
  const [data, setData] = useState(null);   // null = loading, false = error
  const [etag, setEtag] = useState('');
  const [auth, setAuth] = useState({ authenticated: false, firstRun: false, csrfToken: '' });
  const [serverDefaults, setServerDefaults] = useState(null);

  const [prefs, setPref] = usePrefs(serverDefaults, auth.authenticated, auth.csrfToken);

  // Fetch server-side appearance defaults
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(json => setServerDefaults({ ...(json.appearance || {}), refreshInterval: json.refreshIntervalSec }))
      .catch(() => {});
  }, [auth.authenticated]); // re-fetch after login so admin sees fresh defaults

  // Check auth state on mount; show onboard overlay if first-run
  useEffect(() => {
    fetch('/api/auth')
      .then(r => r.json())
      .then(json => {
        setAuth({ authenticated: json.authenticated, firstRun: json.firstRun, csrfToken: json.csrfToken || '' });
        if (json.firstRun) setOverlay('onboard');
      })
      .catch(() => {});
  }, []);

  // Fetch /api/state; re-fetch on interval. When the response is stale,
  // schedule a quick follow-up so the background regen's fresh data is
  // picked up without waiting for the next normal poll.
  useEffect(() => {
    let intervalTimer, quickTimer;
    async function fetchState() {
      try {
        const headers = etag ? { 'If-None-Match': etag } : {};
        const res = await fetch('/api/state', { headers });
        if (res.status === 304) return;
        if (!res.ok) { setData(false); return; }
        const e = res.headers.get('ETag') || '';
        if (e) setEtag(e);
        const json = await res.json();
        setData(json);
        if (json?.meta?.freshness === 'stale') {
          clearTimeout(quickTimer);
          quickTimer = setTimeout(fetchState, 2000);
        }
      } catch {
        if (data === null) setData(false);
      }
    }
    fetchState();
    const interval = Math.max(5000, (prefs.refreshInterval || 30) * 1000);
    intervalTimer = setInterval(fetchState, interval);
    return () => { clearInterval(intervalTimer); clearTimeout(quickTimer); };
  }, [prefs.refreshInterval]);

  // ESC closes overlay (but not the onboard overlay — must complete setup)
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape' && overlay !== 'onboard') setOverlay(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [overlay]);

  function handleAuthSuccess(json) {
    setAuth({ authenticated: true, firstRun: false, csrfToken: json.csrfToken || '' });
    setOverlay(null);
  }

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    setAuth({ authenticated: false, firstRun: false, csrfToken: '' });
    setOverlay(null);
  }

  const items = data?.items ?? [];
  const meta  = data?.meta  ?? {};
  const s = useMemo(() => severitySummary(items), [items]);
  const headline = heroHeadline(s);
  // Only flag as visibly stale when the cache age has exceeded the refresh
  // interval — short windows of staleness are part of normal stale-while-
  // revalidate operation and shouldn't pop a banner.
  const refreshSec = prefs.refreshInterval || 30;
  const ageSec     = meta.staleSince ? Math.floor(Date.now() / 1000) - meta.staleSince : 0;
  const isStale    = meta.freshness === 'stale' && ageSec > refreshSec;

  const close = () => setOverlay(null);

  return html`
    <div class="page">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark"><${Icon} name="bolt" /></span>
          <span>Status</span>
        </div>
        <div class="segmented" role="tablist" aria-label="View detail">
          <button role="tab" aria-selected=${prefs.mode === 'simple'}
                  data-active=${prefs.mode === 'simple'}
                  onClick=${() => setPref('mode', 'simple')}>Simple</button>
          <button role="tab" aria-selected=${prefs.mode === 'detailed'}
                  data-active=${prefs.mode === 'detailed'}
                  onClick=${() => setPref('mode', 'detailed')}>Detailed</button>
        </div>
        <div class="toptools">
          <button class="iconbtn" aria-label="Toggle theme"
                  onClick=${() => setPref('theme', resolveTheme(prefs.theme) === 'dark' ? 'light' : 'dark')}>
            <${Icon} name=${resolveTheme(prefs.theme) === 'dark' ? 'sun' : 'moon'} />
          </button>
          ${auth.authenticated
            ? html`<button class="iconbtn" aria-label="Sign out" onClick=${handleLogout}>
                <${Icon} name="unlock" />
              </button>`
            : html`<button class="iconbtn" aria-label="Sign in" onClick=${() => setOverlay('login')}>
                <${Icon} name="lock" />
              </button>`
          }
          <button class="iconbtn" aria-label="Settings" onClick=${() => setOverlay('settings')}>
            <${Icon} name="cog" />
          </button>
          <button class="menuchip" onClick=${() => setOverlay('about')}>
            <${Icon} name="info" width="14" height="14" />
            <span>About</span>
            <span class="menuchip-countdown">
              <${Countdown} seconds=${prefs.refreshInterval || 30} />
            </span>
          </button>
        </div>
      </header>

      <section class="hero" data-incident=${(s.down > 0 || s.degraded > 0) ? 'true' : 'false'}>
        <div class="hero-eyebrow" data-state=${headline.tone}>
          <span class="pulse" />
          <span>${
            headline.tone === 'down' ? 'Incident in progress' :
            headline.tone === 'warn' ? 'Degraded performance' :
            'All systems normal'
          }</span>
        </div>
        ${data !== null && html`<h1 class="hero-headline">${headline.text}</h1>`}
        <div class="hero-row">
          <dl class="hero-meta">
            <div>
              <dt>Operational</dt>
              <dd>${s.ok} <span class="hero-frac">/ ${s.total}</span></dd>
            </div>
            <div><dt>Degraded</dt><dd>${s.degraded}</dd></div>
            <div><dt>Down</dt><dd>${s.down}</dd></div>
            <div><dt>Paused</dt><dd>${s.paused}</dd></div>
            <div><dt>Last update</dt><dd>${meta.generatedAt ? fmtRelative(meta.generatedAt) : '—'}</dd></div>
          </dl>
          ${prefs.summaryBar && s.total > 0 && html`
            <div class="summarybar-wrap">
              <div class="stackbar">
                ${s.ok      > 0 && html`<span class="sb-ok"     style=${{ width: `${s.ok      / s.total * 100}%` }} />`}
                ${s.degraded > 0 && html`<span class="sb-warn"  style=${{ width: `${s.degraded / s.total * 100}%` }} />`}
                ${s.down    > 0 && html`<span class="sb-down"   style=${{ width: `${s.down    / s.total * 100}%` }} />`}
                ${s.paused  > 0 && html`<span class="sb-paused" style=${{ width: `${s.paused  / s.total * 100}%` }} />`}
              </div>
              <div class="stack-legend">
                <span><i data-key="ok" />Operational</span>
                <span><i data-key="warn" />Degraded</span>
                <span><i data-key="down" />Down</span>
                <span><i data-key="paused" />Paused</span>
              </div>
            </div>
          `}
        </div>
      </section>

      ${isStale && html`
        <div class="stale" role="status">
          <${Icon} name="alert" />
          <span>Showing cached data from <b>${fmtRelative(meta.staleSince)}</b>.
            ${Object.keys(meta.instanceErrors || {}).length > 0
              ? ' One or more providers unreachable.'
              : ''}</span>
        </div>
      `}

      <div class="section-h">
        <h2>Monitors</h2>
        <small>${items.length} items · refreshes every ${prefs.refreshInterval || 30}s</small>
      </div>

      ${data === null && html`<div class="loading-grid">Connecting…</div>`}
      ${data === false && html`<div class="loading-grid">Could not reach /api/state.</div>`}
      ${data && html`
        <div class="grid">
          ${items.map(it => html`<${ItemCard} key=${it.instanceId + ':' + it.itemId} item=${it} />`)}
        </div>
      `}

      <footer class="footer">
        <span>© ${new Date().getFullYear()}</span>
        <span class="footer-links">
          <a href="#" onClick=${e => { e.preventDefault(); setOverlay('about'); }}>About</a>
          <a href="/api/health">Health</a>
          <a href="/api/state">JSON</a>
        </span>
      </footer>

      ${overlay === 'settings' && html`
        <${SettingsDrawer} prefs=${prefs} setPref=${setPref} onClose=${close} authenticated=${auth.authenticated} />`}
      ${overlay === 'login'    && html`<${LoginModal}     onClose=${close} onSuccess=${handleAuthSuccess} />`}
      ${overlay === 'onboard'  && html`<${OnboardOverlay} onSuccess=${handleAuthSuccess} />`}
      ${overlay === 'about'    && html`<${AboutModal}     onClose=${close} itemCount=${items.length} />`}
    </div>
  `;
}

render(html`<${App} />`, document.getElementById('root'));
