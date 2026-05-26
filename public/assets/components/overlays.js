import { html, useState, useRef } from 'htm/preact';
import { Icon } from '/assets/icons.js';

/* ── Shared sub-components ── */
function Segmented({ value, options, onChange }) {
  return html`
    <div class="segmented segmented-sm" role="radiogroup">
      ${options.map(o => html`
        <button key=${o} role="radio" aria-checked=${value === o} data-active=${value === o}
                onClick=${() => onChange(o)}>${o}</button>
      `)}
    </div>
  `;
}

function Swatches({ value, options, onChange }) {
  return html`
    <div class="swatches">
      ${options.map(name => html`
        <button key=${name} class="swatch" data-name=${name} data-active=${value === name}
                onClick=${() => onChange(name)} aria-label=${name} title=${name}>
          <span />
        </button>
      `)}
    </div>
  `;
}

function Switch({ on, onClick }) {
  return html`
    <button class="switch" data-on=${String(on)} onClick=${onClick} aria-pressed=${on}>
      <span class="switch-thumb" />
    </button>
  `;
}

function SettingRow({ label, hint, children }) {
  return html`
    <div class="setting-row">
      <div class="setting-row-l">
        <div class="setting-row-label">${label}</div>
        ${hint && html`<div class="setting-row-hint">${hint}</div>`}
      </div>
      <div class="setting-row-r">${children}</div>
    </div>
  `;
}

/* ── Settings drawer ── */
export function SettingsDrawer({ prefs, setPref, onClose }) {
  const [tab, setTab] = useState('appearance');

  return html`
    <div class="scrim" onClick=${onClose} />
    <aside class="drawer" role="dialog" aria-label="Settings">
        <div class="drawer-head">
          <h2>Settings</h2>
          <button class="iconbtn" onClick=${onClose} aria-label="Close"><${Icon} name="x" /></button>
        </div>
        <div class="drawer-tabs">
          ${['appearance', 'catalog', 'order', 'auth'].map(t => html`
            <button key=${t} class="drawer-tab" data-active=${tab === t}
                    onClick=${() => setTab(t)}>${t === 'order' ? 'Display order' : t}</button>
          `)}
        </div>
        <div class="drawer-body">
          ${tab === 'appearance' && html`<${AppearanceTab} prefs=${prefs} setPref=${setPref} />`}
          ${tab === 'catalog'    && html`<${CatalogTab} />`}
          ${tab === 'order'      && html`<${OrderTab} />`}
          ${tab === 'auth'       && html`<${AuthTab} />`}
        </div>
      </aside>
  `;
}

function AppearanceTab({ prefs, setPref }) {
  return html`
    <div class="setting-list">
      <${SettingRow} label="View detail" hint="Compact cards or full element readouts.">
        <${Segmented} value=${prefs.mode} options=${['simple', 'detailed']}
                      onChange=${v => setPref('mode', v)} />
      <//>
      <${SettingRow} label="Theme">
        <${Segmented} value=${prefs.theme} options=${['auto', 'light', 'dark']}
                      onChange=${v => setPref('theme', v)} />
      <//>
      <${SettingRow} label="Density" hint="Card padding and grid columns.">
        <${Segmented} value=${prefs.density} options=${['cozy', 'regular', 'airy']}
                      onChange=${v => setPref('density', v)} />
      <//>
      <${SettingRow} label="Card style">
        <${Segmented} value=${prefs.cardstyle} options=${['flat', 'paper', 'elev']}
                      onChange=${v => setPref('cardstyle', v)} />
      <//>
      <${SettingRow} label="Severity mark" hint="How non-ok cards stand out.">
        <${Segmented} value=${prefs.mark} options=${['stripe', 'dot']}
                      onChange=${v => setPref('mark', v)} />
      <//>
      <${SettingRow} label="Accent" hint="Used for links and focus rings; status colors are fixed.">
        <${Swatches} value=${prefs.accent}
                     options=${['mint', 'citron', 'violet', 'coral', 'ink']}
                     onChange=${v => setPref('accent', v)} />
      <//>
      <${SettingRow} label="Show summary bar" hint="Stacked status legend in the hero.">
        <${Switch} on=${prefs.summaryBar} onClick=${() => setPref('summaryBar', !prefs.summaryBar)} />
      <//>
      <${SettingRow} label="Sparklines" hint="Inline history under gauges and counters.">
        <${Switch} on=${prefs.sparklines} onClick=${() => setPref('sparklines', !prefs.sparklines)} />
      <//>
    </div>
  `;
}

function CatalogTab() {
  return html`
    <div class="catalog">
      <p class="drawer-intro">
        Toggle visibility and rename discovered items. Add instances to populate.
      </p>
      <button class="btn btn-ghost cat-add-btn">+ Add instance</button>
    </div>
  `;
}

function OrderTab() {
  return html`
    <div>
      <p class="drawer-intro">
        Drag rows to reorder. Items interleave across instances and providers.
      </p>
      <p class="drawer-intro">No items configured yet.</p>
    </div>
  `;
}

function AuthTab() {
  const [methods, setMethods] = useState({ form: true, basic: false, token: false, cert: false });
  const toggle = k => setMethods(m => ({ ...m, [k]: !m[k] }));
  const rows = [
    { k: 'form',  name: 'Session login',      badge: 'default', sub: 'HTML form against bcrypt hash.' },
    { k: 'basic', name: 'HTTP Basic',          sub: 'Same password. For curl & scripts.' },
    { k: 'token', name: 'Bearer token',        sub: 'Reveal in settings.json. Rotatable.' },
    { k: 'cert',  name: 'Client certificate',  sub: 'Validated by Caddy; subject DN allowlist.' },
  ];
  return html`
    <div>
      <p class="drawer-intro">At least one method must remain enabled.</p>
      ${rows.map(({ k, name, badge, sub }) => html`
        <div key=${k} class="auth-method-row">
          <div>
            <div class="auth-method-name">
              ${name}
              ${badge && html`<span class="chip">${badge}</span>`}
            </div>
            <div class="auth-method-sub">${sub}</div>
          </div>
          <${Switch} on=${methods[k]} onClick=${() => toggle(k)} />
        </div>
      `)}
      <h3 class="auth-section-h">Change password</h3>
      <div class="form-row">
        <input class="input" type="password" placeholder="Current password" />
      </div>
      <div class="form-row">
        <input class="input" type="password" placeholder="New password (min 8)" />
      </div>
      <button class="btn">Update</button>
    </div>
  `;
}

/* ── Login modal ── */
export function LoginModal({ onClose, onSuccess }) {
  const [pw, setPw]       = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function submit(e) {
    e.preventDefault();
    if (busy || !pw) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Login failed.');
        setBusy(false);
        return;
      }
      onSuccess?.(json);
    } catch {
      setError('Network error. Please try again.');
      setBusy(false);
    }
  }

  return html`
    <div class="scrim" onClick=${onClose} />
    <div class="modal" role="dialog" aria-label="Sign in">
        <h2>Sign in</h2>
        <p>Authenticated admin access to settings, discovery, and threshold editing.</p>
        <form onSubmit=${submit}>
          <div class="form-row">
            <label for="pw">Password</label>
            <input id="pw" class="input" type="password" autoFocus ref=${inputRef}
                   value=${pw} onInput=${e => setPw(e.target.value)} />
          </div>
          ${error && html`<p class="form-error">${error}</p>`}
          <button class="btn btn-block" type="submit" disabled=${busy || !pw}>
            ${busy ? 'Signing in…' : 'Continue'}
          </button>
        </form>
        <p class="modal-note-sm">
          Forgot? Clear <span class="mono">auth.passwordHash</span> in
          <span class="mono">settings.json</span> to re-onboard.
        </p>
      </div>
  `;
}

/* ── Onboarding overlay ── */
export function OnboardOverlay({ onSuccess }) {
  const [pw, setPw]       = useState('');
  const [pw2, setPw2]     = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const ok = pw.length >= 8 && pw === pw2;

  async function submit(e) {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Setup failed.');
        setBusy(false);
        return;
      }
      onSuccess?.(json);
    } catch {
      setError('Network error. Please try again.');
      setBusy(false);
    }
  }

  return html`
    <div class="scrim" />
    <div class="modal modal--wide" role="dialog" aria-label="First-run setup">
        <div class="onboard-icon">
          <${Icon} name="bolt" width="22" height="22" />
        </div>
        <h2>Welcome to your status page</h2>
        <p>
          Set an admin password to unlock settings and discovery.
          The public status view becomes available immediately after.
        </p>
        <form onSubmit=${submit}>
          <div class="form-row">
            <label>Admin password</label>
            <input class="input" type="password" value=${pw}
                   onInput=${e => setPw(e.target.value)} placeholder="At least 8 characters" />
          </div>
          <div class="form-row">
            <label>Confirm</label>
            <input class="input" type="password" value=${pw2}
                   onInput=${e => setPw2(e.target.value)} />
          </div>
          ${error && html`<p class="form-error">${error}</p>`}
          <button class="btn btn-block" type="submit" disabled=${!ok || busy}>
            ${busy ? 'Setting up…' : 'Set password & continue'}
          </button>
        </form>
        <p class="modal-note">
          Hashed with bcrypt. Stored in <span class="mono">config/settings.json</span>.
          No telemetry, no external services.
        </p>
      </div>
  `;
}

/* ── About modal ── */
export function AboutModal({ onClose, itemCount = 0 }) {
  return html`
    <div class="scrim" onClick=${onClose} />
    <div class="modal modal--md" role="dialog" aria-label="About">
        <h2>About this status page</h2>
        <p>
          A fast, lightweight status page for self-hosted services.
          Vanilla PHP, vanilla JS, single JSON config. MIT licensed.
        </p>
        <dl class="about-stats">
          <div><dt>Version</dt><dd class="mono">1.0.0</dd></div>
          <div><dt>Items</dt><dd>${itemCount} visible</dd></div>
        </dl>
        <div class="modal-actions">
          <a class="link-btn" href="#" onClick=${e => e.preventDefault()}>
            Source on GitHub <${Icon} name="external" />
          </a>
        </div>
      </div>
  `;
}
