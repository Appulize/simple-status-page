import { html, useState, useEffect, useMemo, useRef } from 'htm/preact';
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

function Switch({ on, onClick, disabled = false, title }) {
  return html`
    <button class="switch" data-on=${String(on)} onClick=${onClick}
            aria-pressed=${on} disabled=${disabled} title=${title}>
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

function InlineError({ message }) {
  if (!message) return null;
  return html`<div class="form-error">${message}</div>`;
}

/* ── Settings drawer (stateful when authenticated) ── */
export function SettingsDrawer({ prefs, setPref, onClose, authenticated, csrfToken, onSaved }) {
  const [tab, setTab] = useState('appearance');
  const [previewing, setPreviewing] = useState(false);
  const previewSetPref = (k, v) => { setPreviewing(true); setPref(k, v); };
  const scrimClear = tab === 'appearance' && previewing;

  // Settings doc state (only when authenticated).
  // `settings`  = last server-committed view (what other tabs read).
  // `draft`     = catalog tab's batched edits; null until first local edit.
  // `mtime`     = If-Match value for the next POST.
  // Rapid catalog toggles mutate `draft` synchronously without POSTing; the doc
  // is flushed (POSTed) on tab change or drawer close to avoid concurrent-write
  // races. Order/Auth/Wizard tabs still save immediately via `saveSettings`.
  const [settings, setSettings] = useState(null);
  const [mtime, setMtime] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [conflict, setConflict] = useState(null);
  const draftRef = useRef(null);
  const flushingRef = useRef(false);

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings', { headers: { 'Accept': 'application/json' } });
      if (!res.ok) {
        setLoadError(`Could not load settings (${res.status}).`);
        return;
      }
      const json = await res.json();
      setSettings(json.settings);
      setMtime(json.meta?.mtime || 0);
      draftRef.current = null;
      setLoadError('');
    } catch {
      setLoadError('Network error loading settings.');
    }
  }

  useEffect(() => {
    if (authenticated) loadSettings();
  }, [authenticated]);

  // Compute the doc the editors should render against: the local draft if one
  // exists, otherwise the committed server state.
  const liveSettings = draftRef.current ?? settings;

  // editLocal: mutate the in-memory draft without POSTing. The view re-renders
  // because we bump a tick state to force the read of draftRef.
  const [draftTick, setDraftTick] = useState(0);
  function editLocal(mutator) {
    const base = draftRef.current ?? settings;
    if (!base) return;
    const next = structuredClone(base);
    mutator(next);
    draftRef.current = next;
    setDraftTick(t => t + 1);
  }

  // POST whatever doc the caller supplies (either an immediate-save mutator or
  // a flushed draft). On success advances mtime + settings, clears draft, fires
  // onSaved with the new doc so App.js can force-refresh /api/state.
  async function postDoc(nextDoc) {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
          'If-Match': String(mtime),
        },
        body: JSON.stringify({ settings: nextDoc }),
      });
      if (res.status === 409) {
        const j = await res.json().catch(() => ({}));
        setConflict({ server: j.current?.settings, mtime: j.current?.meta?.mtime || 0 });
        return { ok: false, conflict: true };
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: json.error || `Save failed (${res.status}).` };
      }
      setSettings(nextDoc);
      setMtime(json.meta?.mtime || 0);
      draftRef.current = null;
      setDraftTick(t => t + 1);
      onSaved?.(nextDoc);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error.' };
    }
  }

  // Immediate-save path for Order/Auth/Wizard tabs.
  async function saveSettings(mutator) {
    const base = draftRef.current ?? settings;
    if (!base) return { ok: false, error: 'No settings loaded.' };
    const draft = structuredClone(base);
    mutator(draft);
    return postDoc(draft);
  }

  // Flush the local draft if dirty. Returns the POST result or {ok:true} when nothing to do.
  async function flushDraft() {
    if (!draftRef.current || flushingRef.current) return { ok: true };
    flushingRef.current = true;
    try {
      return await postDoc(draftRef.current);
    } finally {
      flushingRef.current = false;
    }
  }

  async function switchTab(t) {
    if (t === tab) return;
    await flushDraft();
    setTab(t);
    setPreviewing(false);
  }

  async function handleClose() {
    await flushDraft();
    onClose?.();
  }

  function acceptConflict() {
    if (conflict) {
      setSettings(conflict.server);
      setMtime(conflict.mtime);
      draftRef.current = null;
      setDraftTick(t => t + 1);
    }
    setConflict(null);
  }

  return html`
    <div class=${'scrim' + (scrimClear ? ' scrim--clear' : '')} onClick=${handleClose} />
    <aside class="drawer" role="dialog" aria-label="Settings">
      <div class="drawer-head">
        <h2>Settings</h2>
        <button class="iconbtn" onClick=${handleClose} aria-label="Close"><${Icon} name="x" /></button>
      </div>
      <div class="drawer-tabs">
        ${['appearance', 'catalog', 'order', 'auth'].map(t => html`
          <button key=${t} class="drawer-tab" data-active=${tab === t}
                  onClick=${() => switchTab(t)}>${t === 'order' ? 'Display order' : t}</button>
        `)}
      </div>
      <div class="drawer-body">
        ${tab === 'appearance' && html`
          <${AppearanceTab} prefs=${prefs} setPref=${previewSetPref} authenticated=${authenticated} />`}
        ${tab === 'catalog' && (authenticated
          ? html`<${CatalogTab} settings=${liveSettings} editLocal=${editLocal} saveSettings=${saveSettings}
                                 csrfToken=${csrfToken} loadError=${loadError} />`
          : html`<${AuthGate} />`)}
        ${tab === 'order' && (authenticated
          ? html`<${OrderTab} settings=${liveSettings} saveSettings=${saveSettings} loadError=${loadError} />`
          : html`<${AuthGate} />`)}
        ${tab === 'auth' && (authenticated
          ? html`<${AuthTab} settings=${liveSettings} saveSettings=${saveSettings}
                              csrfToken=${csrfToken} loadError=${loadError} reload=${loadSettings} />`
          : html`<${AuthGate} />`)}
      </div>
    </aside>
    ${conflict && html`<${ConflictModal} onReload=${acceptConflict} onCancel=${() => setConflict(null)} />`}
  `;
}

function AuthGate() {
  return html`
    <div class="catalog">
      <p class="drawer-intro">Sign in with the admin password to manage these settings.</p>
    </div>
  `;
}

function ConflictModal({ onReload, onCancel }) {
  return html`
    <div class="scrim" onClick=${onCancel} />
    <div class="modal modal--md" role="dialog" aria-label="Settings conflict">
      <h2>Settings were changed elsewhere</h2>
      <p>Another writer saved <span class="mono">settings.json</span> while this drawer was open. Reload the latest version? Your in-flight change was not applied.</p>
      <div class="modal-actions">
        <button class="btn" onClick=${onReload}>Reload latest</button>
        <button class="btn btn-ghost" onClick=${onCancel}>Cancel</button>
      </div>
    </div>
  `;
}

/* ── Appearance tab ── */
function AppearanceTab({ prefs, setPref, authenticated }) {
  function resetLocal() {
    try { localStorage.removeItem('simplestatus.prefs.v1'); } catch {}
    location.reload();
  }
  return html`
    <div class="setting-list">
      ${authenticated
        ? html`<p class="drawer-intro">You're editing the public-facing defaults. Changes save to the server immediately.</p>`
        : html`<p class="drawer-intro">Personal overrides saved in this browser only. Admins set the public defaults after signing in.</p>`}
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
      <${SettingRow} label="Refresh interval" hint="How often this browser polls for fresh data. Per-viewer.">
        <${Segmented} value=${String(prefs.refreshInterval || 30)}
                      options=${['10', '30', '60', '300']}
                      onChange=${v => setPref('refreshInterval', Number(v))} />
      <//>
      ${!authenticated && html`
        <div class="setting-row">
          <div class="setting-row-l">
            <div class="setting-row-label">Reset to site defaults</div>
            <div class="setting-row-hint">Clears your personal overrides and falls back to what the admin configured.</div>
          </div>
          <div class="setting-row-r">
            <button class="btn btn-ghost" onClick=${resetLocal}>Reset</button>
          </div>
        </div>
      `}
    </div>
  `;
}

/* ── Catalog tab ── */
function CatalogTab({ settings, editLocal, saveSettings, csrfToken, loadError }) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [rowError, setRowError] = useState({}); // keyed by instanceId for per-instance errors
  const [pendingDiscovery, setPendingDiscovery] = useState({});

  if (loadError) return html`<p class="form-error">${loadError}</p>`;
  if (!settings) return html`<p class="drawer-intro">Loading…</p>`;

  const instances = settings.instances || [];

  function setError(instId, msg) {
    setRowError(prev => ({ ...prev, [instId]: msg }));
  }

  // Local-only edits — buffered until tab change / drawer close. This avoids
  // racing concurrent POSTs when the user toggles several items rapidly.
  function toggleVisible(instId, itemId, next) {
    editLocal(draft => {
      const inst = draft.instances.find(i => i.id === instId);
      if (!inst) return;
      const row = (inst.items ||= []).find(it => it.id === itemId);
      if (row) row.visible = next;
      const orderKey = (e) => e.instanceId === instId && e.itemId === itemId;
      draft.displayOrder = (draft.displayOrder || []).filter(e => !orderKey(e));
      if (next) draft.displayOrder.push({ instanceId: instId, itemId });
    });
    setError(instId, '');
  }

  function renameItem(instId, itemId, value) {
    const trimmed = value.trim();
    editLocal(draft => {
      const inst = draft.instances.find(i => i.id === instId);
      if (!inst) return;
      const row = (inst.items ||= []).find(it => it.id === itemId);
      if (row) row.displayName = trimmed === '' ? null : trimmed;
    });
    setError(instId, '');
  }

  async function rediscover(instId) {
    setPendingDiscovery(p => ({ ...p, [instId]: true }));
    setError(instId, '');
    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ instanceId: instId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(instId, json.error || `Discover failed (${res.status}).`);
        return;
      }
      editLocal(draft => {
        const inst = draft.instances.find(i => i.id === instId);
        if (!inst) return;
        const existing = Object.fromEntries((inst.items || []).map(it => [it.id, it]));
        const seen = new Set();
        const items = [];
        for (const n of json.nodes || []) {
          const id = String(n.id);
          const isChild = (n.parentId ?? null) !== null;
          const prior = existing[id];
          items.push({
            id,
            visible: prior?.visible ?? !isChild,
            displayName: prior?.displayName ?? (n.label || null),
          });
          seen.add(id);
        }
        for (const [id, row] of Object.entries(existing)) {
          if (!seen.has(id)) items.push(row);
        }
        inst.items = items;
      });
    } catch {
      setError(instId, 'Network error during discovery.');
    } finally {
      setPendingDiscovery(p => ({ ...p, [instId]: false }));
    }
  }

  function removeInstance(instId) {
    if (!confirm('Remove this instance and all its items? This cannot be undone.')) return;
    editLocal(draft => {
      draft.instances = (draft.instances || []).filter(i => i.id !== instId);
      draft.displayOrder = (draft.displayOrder || []).filter(e => e.instanceId !== instId);
    });
  }

  return html`
    <div class="catalog">
      <p class="drawer-intro">Toggle visibility and rename discovered items. Removed-upstream items remain as orphans until you uncheck them.</p>
      ${instances.length === 0 && html`
        <p class="drawer-intro">No instances configured yet. Add one to get started.</p>`}
      ${instances.map(inst => html`
        <div key=${inst.id} class="cat-group">
          <div class="cat-group-h">
            <b>${inst.name || inst.id}</b>
            <div class="actions">
              <button onClick=${() => rediscover(inst.id)} disabled=${pendingDiscovery[inst.id]}>
                ${pendingDiscovery[inst.id] ? 'Discovering…' : 'Re-discover'}
              </button>
              <button onClick=${() => removeInstance(inst.id)}>Remove</button>
            </div>
          </div>
          ${(inst.items || []).map(it => html`
            <${CatalogRow} key=${it.id}
                           instanceId=${inst.id}
                           item=${it}
                           onToggle=${(next) => toggleVisible(inst.id, it.id, next)}
                           onRename=${(name) => renameItem(inst.id, it.id, name)} />
          `)}
          ${(inst.items || []).length === 0 && html`
            <div class="cat-row"><span class="label">No items discovered. Click Re-discover to fetch.</span></div>
          `}
          ${rowError[inst.id] && html`<div class="cat-row"><span class="label form-error">${rowError[inst.id]}</span></div>`}
        </div>
      `)}
      <button class="btn btn-ghost cat-add-btn" onClick=${() => setWizardOpen(true)}>+ Add instance</button>
      ${wizardOpen && html`
        <${AddInstanceWizard}
          csrfToken=${csrfToken}
          saveSettings=${saveSettings}
          onClose=${() => setWizardOpen(false)}
        />`}
    </div>
  `;
}

function CatalogRow({ instanceId, item, onToggle, onRename }) {
  // Local input state so we don't POST on every keystroke; commit on blur or Enter.
  const [draft, setDraft] = useState(item.displayName ?? '');
  const initial = useRef(item.displayName ?? '');
  useEffect(() => {
    setDraft(item.displayName ?? '');
    initial.current = item.displayName ?? '';
  }, [item.displayName]);

  const isChild = item.id.includes('::');

  function commit() {
    if (draft === initial.current) return;
    onRename(draft);
    initial.current = draft;
  }

  return html`
    <div class="cat-row" data-child=${isChild ? 'true' : 'false'}>
      <input type="checkbox" class="checkbox"
             checked=${!!item.visible}
             onChange=${e => onToggle(e.target.checked)}
             aria-label="Visible" />
      <input class="input cat-rename" type="text" value=${draft}
             placeholder=${item.id}
             onInput=${e => setDraft(e.target.value)}
             onBlur=${commit}
             onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } }} />
      <span class="hint">${item.id}</span>
    </div>
  `;
}

/* ── Display Order tab ── */
function OrderTab({ settings, saveSettings, loadError }) {
  const [dragId, setDragId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [error, setError] = useState('');

  if (loadError) return html`<p class="form-error">${loadError}</p>`;
  if (!settings) return html`<p class="drawer-intro">Loading…</p>`;

  // Build a labeled, visible-only ordered list. Entries in displayOrder that
  // reference non-visible/missing items are filtered out for display but
  // preserved on save by appending them back unchanged at the end.
  const visibleSet = new Map();
  const labelOf = {};
  const srcOf   = {};
  for (const inst of settings.instances || []) {
    for (const it of inst.items || []) {
      const key = inst.id + '|' + it.id;
      if (it.visible) {
        visibleSet.set(key, true);
        labelOf[key] = it.displayName || it.id;
        srcOf[key]   = inst.name || inst.id;
      }
    }
  }

  const order = (settings.displayOrder || []).map(e => e.instanceId + '|' + e.itemId);
  const orderedVisible = order.filter(k => visibleSet.has(k));
  // Visible items not yet in order → render at end.
  const tail = [...visibleSet.keys()].filter(k => !order.includes(k));
  const rows = [...orderedVisible, ...tail];

  async function commitOrder(newRows) {
    setError('');
    const r = await saveSettings(draft => {
      const newDisplay = newRows.map(k => {
        const [instanceId, ...rest] = k.split('|');
        return { instanceId, itemId: rest.join('|') };
      });
      // Preserve hidden/legacy entries by re-appending any that the UI didn't show.
      const present = new Set(newRows);
      const preserved = (draft.displayOrder || []).filter(e => !present.has(e.instanceId + '|' + e.itemId));
      // But drop preserved entries whose item is now visible (we already moved it).
      draft.displayOrder = [...newDisplay, ...preserved.filter(e => {
        const inst = draft.instances.find(i => i.id === e.instanceId);
        const item = inst?.items?.find(it => it.id === e.itemId);
        return item && !item.visible;
      })];
    });
    if (!r.ok && !r.conflict) setError(r.error || 'Reorder failed.');
  }

  function onDragStart(key, e) {
    setDragId(key);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
  }
  function onDragOver(key, e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (key !== hoverId) setHoverId(key);
  }
  function onDrop(targetKey, e) {
    e.preventDefault();
    const sourceKey = dragId || e.dataTransfer.getData('text/plain');
    setDragId(null);
    setHoverId(null);
    if (!sourceKey || sourceKey === targetKey) return;
    const next = rows.filter(k => k !== sourceKey);
    const idx = next.indexOf(targetKey);
    next.splice(idx, 0, sourceKey);
    commitOrder(next);
  }

  return html`
    <div>
      <p class="drawer-intro">Drag rows to reorder. Items interleave across instances and providers. Hidden items don't appear here.</p>
      ${rows.length === 0 && html`<p class="drawer-intro">No visible items yet. Make some visible in Catalog.</p>`}
      <div class="draglist">
        ${rows.map(key => html`
          <div key=${key} class="drag-row"
               draggable=${true}
               data-dragging=${dragId === key ? 'true' : 'false'}
               data-hover=${hoverId === key && dragId !== key ? 'true' : 'false'}
               onDragStart=${e => onDragStart(key, e)}
               onDragOver=${e => onDragOver(key, e)}
               onDragLeave=${() => { if (hoverId === key) setHoverId(null); }}
               onDrop=${e => onDrop(key, e)}
               onDragEnd=${() => { setDragId(null); setHoverId(null); }}>
            <span class="grip"><${Icon} name="drag" /></span>
            <span class="label">${labelOf[key]}</span>
            <span class="src">${srcOf[key]}</span>
          </div>
        `)}
      </div>
      <${InlineError} message=${error} />
    </div>
  `;
}

/* ── Auth tab ── */
function AuthTab({ settings, saveSettings, csrfToken, loadError, reload }) {
  const [error, setError] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [revealedToken, setRevealedToken] = useState('');
  const [revealing, setRevealing] = useState(false);
  const [rotating, setRotating] = useState(false);

  if (loadError) return html`<p class="form-error">${loadError}</p>`;
  if (!settings) return html`<p class="drawer-intro">Loading…</p>`;

  const methods = settings.auth?.methods || {};
  const enabledCount = ['form', 'basic', 'token', 'clientCert']
    .reduce((n, k) => n + ((methods[k]?.enabled) ? 1 : 0), 0);

  async function toggleMethod(key) {
    const current = !!methods[key]?.enabled;
    if (current && enabledCount <= 1) return; // lockout guard (UI also disables the toggle)
    setError('');
    const r = await saveSettings(draft => {
      draft.auth.methods[key] = { ...(draft.auth.methods[key] || {}), enabled: !current };
    });
    if (!r.ok && !r.conflict) setError(r.error || 'Save failed.');
  }

  async function setCertHeaderName(v) {
    setError('');
    const r = await saveSettings(draft => {
      draft.auth.methods.clientCert.headerName = v;
    });
    if (!r.ok && !r.conflict) setError(r.error || 'Save failed.');
  }

  async function setAllowedSubjects(list) {
    setError('');
    const r = await saveSettings(draft => {
      draft.auth.methods.clientCert.allowedSubjects = list;
    });
    if (!r.ok && !r.conflict) setError(r.error || 'Save failed.');
  }

  async function rotateToken() {
    setRotating(true);
    setTokenError('');
    try {
      const res = await fetch('/api/token/rotate', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      const json = await res.json();
      if (!res.ok) {
        setTokenError(json.error || `Rotate failed (${res.status}).`);
        return;
      }
      setRevealedToken(json.token || '');
      setRevealing(true);
      await reload(); // pick up new mtime + token in local state
    } catch {
      setTokenError('Network error rotating token.');
    } finally {
      setRotating(false);
    }
  }

  function copyToken() {
    if (!revealedToken) return;
    navigator.clipboard?.writeText(revealedToken).catch(() => {});
  }

  const tokenEnabled = !!methods.token?.enabled;
  const tokenValue   = revealedToken || methods.token?.token || '';
  const tokenDisplay = revealing
    ? tokenValue
    : (tokenValue ? '•'.repeat(Math.min(40, tokenValue.length)) : '(no token set)');

  const certEnabled = !!methods.clientCert?.enabled;

  return html`
    <div>
      <p class="drawer-intro">At least one method must remain enabled. The off-toggle on the last enabled method is disabled.</p>

      <div class="auth-method-row">
        <div>
          <div class="auth-method-name">Session login <span class="chip">default</span></div>
          <div class="auth-method-sub">HTML form against bcrypt hash.</div>
        </div>
        <${Switch} on=${!!methods.form?.enabled}
                   disabled=${!!methods.form?.enabled && enabledCount <= 1}
                   title=${(!!methods.form?.enabled && enabledCount <= 1) ? 'Enable another method first.' : ''}
                   onClick=${() => toggleMethod('form')} />
      </div>

      <div class="auth-method-row">
        <div>
          <div class="auth-method-name">HTTP Basic</div>
          <div class="auth-method-sub">Same password as form login.</div>
        </div>
        <${Switch} on=${!!methods.basic?.enabled}
                   disabled=${!!methods.basic?.enabled && enabledCount <= 1}
                   title=${(!!methods.basic?.enabled && enabledCount <= 1) ? 'Enable another method first.' : ''}
                   onClick=${() => toggleMethod('basic')} />
      </div>

      <div class="auth-method-row">
        <div class="auth-method-l">
          <div class="auth-method-name">API key (Bearer token)</div>
          <div class="auth-method-sub">Send <span class="mono">Authorization: Bearer &lt;token&gt;</span>. CSRF-exempt.</div>
          ${tokenEnabled && html`
            <div class="form-row token-row">
              <input class="input mono" readonly value=${tokenDisplay} />
              <button class="btn btn-ghost" onClick=${() => setRevealing(v => !v)}>
                ${revealing ? 'Hide' : 'Reveal'}
              </button>
              <button class="btn btn-ghost" onClick=${copyToken} disabled=${!tokenValue}>Copy</button>
              <button class="btn btn-ghost" onClick=${rotateToken} disabled=${rotating}>
                ${rotating ? 'Rotating…' : 'Rotate'}
              </button>
            </div>
            <${InlineError} message=${tokenError} />
          `}
        </div>
        <${Switch} on=${tokenEnabled}
                   disabled=${tokenEnabled && enabledCount <= 1}
                   title=${(tokenEnabled && enabledCount <= 1) ? 'Enable another method first.' : ''}
                   onClick=${() => toggleMethod('token')} />
      </div>

      <div class="auth-method-row">
        <div class="auth-method-l">
          <div class="auth-method-name">Client certificate</div>
          <div class="auth-method-sub">Caddy validates the cert and forwards a header; subject DNs are allowlisted below.</div>
          ${certEnabled && html`<${CertSubjectsEditor}
                settings=${settings}
                onChangeHeader=${setCertHeaderName}
                onChangeList=${setAllowedSubjects} />`}
        </div>
        <${Switch} on=${certEnabled}
                   disabled=${certEnabled && enabledCount <= 1}
                   title=${(certEnabled && enabledCount <= 1) ? 'Enable another method first.' : ''}
                   onClick=${() => toggleMethod('clientCert')} />
      </div>

      <${InlineError} message=${error} />

      <h3 class="auth-section-h">Change password</h3>
      <${ChangePasswordForm} csrfToken=${csrfToken} />
    </div>
  `;
}

function CertSubjectsEditor({ settings, onChangeHeader, onChangeList }) {
  const cc = settings.auth?.methods?.clientCert || {};
  const list = cc.allowedSubjects || [];
  const [headerDraft, setHeaderDraft] = useState(cc.headerName || 'X-Client-Cert-Subject');
  useEffect(() => { setHeaderDraft(cc.headerName || 'X-Client-Cert-Subject'); }, [cc.headerName]);

  function addRow() { onChangeList([...list, '']); }
  function removeRow(i) { onChangeList(list.filter((_, idx) => idx !== i)); }
  function setRow(i, v) {
    const next = list.slice();
    next[i] = v;
    onChangeList(next);
  }

  return html`
    <div class="cert-editor">
      <div class="form-row">
        <label>Header name</label>
        <input class="input" type="text" value=${headerDraft}
               onInput=${e => setHeaderDraft(e.target.value)}
               onBlur=${() => { if (headerDraft !== (cc.headerName || '')) onChangeHeader(headerDraft); }} />
      </div>
      <label class="form-label">Allowed subject DNs</label>
      ${list.length === 0 && html`<p class="auth-method-sub">No subjects allowed yet — this method will deny everyone until you add one.</p>`}
      ${list.map((s, i) => html`
        <div class="form-row token-row" key=${i}>
          <input class="input mono" type="text" value=${s}
                 onInput=${e => setRow(i, e.target.value)}
                 onBlur=${() => onChangeList(list)} />
          <button class="btn btn-ghost" onClick=${() => removeRow(i)} aria-label="Remove">×</button>
        </div>
      `)}
      <button class="btn btn-ghost" onClick=${addRow}>+ Add subject</button>
    </div>
  `;
}

function ChangePasswordForm({ csrfToken }) {
  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk]       = useState(false);

  const valid = current.length > 0 && next.length >= 8 && next === confirm;

  async function submit(e) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    setOk(false);
    try {
      const res = await fetch('/api/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ current, new: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || `Update failed (${res.status}).`);
        return;
      }
      setOk(true);
      setCurrent(''); setNext(''); setConfirm('');
      // Server destroys the session — surface that via a quick reload after a beat.
      setTimeout(() => location.reload(), 1500);
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  }

  return html`
    <form onSubmit=${submit}>
      <div class="form-row">
        <input class="input" type="password" placeholder="Current password"
               value=${current} onInput=${e => setCurrent(e.target.value)} />
      </div>
      <div class="form-row">
        <input class="input" type="password" placeholder="New password (min 8)"
               value=${next} onInput=${e => setNext(e.target.value)} />
      </div>
      <div class="form-row">
        <input class="input" type="password" placeholder="Confirm new password"
               value=${confirm} onInput=${e => setConfirm(e.target.value)} />
      </div>
      <${InlineError} message=${error} />
      ${ok && html`<p class="form-success">Password updated. Signing you out…</p>`}
      <button class="btn" type="submit" disabled=${!valid || busy}>${busy ? 'Updating…' : 'Update'}</button>
    </form>
  `;
}

/* ── Add Instance wizard ── */
function AddInstanceWizard({ csrfToken, saveSettings, onClose }) {
  const [step, setStep] = useState(1);          // 1 picker, 2 config+discover, 3 review, 4 saving
  const [providers, setProviders] = useState(null);
  const [provError, setProvError] = useState('');
  const [chosen, setChosen] = useState('');
  const [name, setName] = useState('');
  const [config, setConfig] = useState({});
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState('');
  const [nodes, setNodes] = useState([]);
  const [selected, setSelected] = useState({}); // id → bool
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    fetch('/api/providers')
      .then(r => r.json().then(j => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (!ok) { setProvError(json.error || 'Could not load providers.'); return; }
        setProviders(json.providers || []);
      })
      .catch(() => setProvError('Network error loading providers.'));
  }, []);

  const provider = useMemo(
    () => (providers || []).find(p => p.id === chosen) || null,
    [providers, chosen]
  );

  async function runDiscover() {
    setDiscovering(true);
    setDiscoverError('');
    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ provider: chosen, config }),
      });
      const json = await res.json();
      if (!res.ok) {
        setDiscoverError(json.error || `Discover failed (${res.status}).`);
        return;
      }
      const found = json.nodes || [];
      setNodes(found);
      const initSel = {};
      for (const n of found) initSel[String(n.id)] = (n.parentId ?? null) === null; // parents default visible, children default hidden
      setSelected(initSel);
      setStep(3);
    } catch {
      setDiscoverError('Network error during discovery.');
    } finally {
      setDiscovering(false);
    }
  }

  async function commit() {
    setSaving(true);
    setSaveError('');
    const id = (crypto.randomUUID && crypto.randomUUID()) || ('inst-' + Math.random().toString(36).slice(2, 10));
    const items = nodes.map(n => ({
      id: String(n.id),
      visible: !!selected[String(n.id)],
      displayName: n.label || null,
    }));
    const newOrder = items.filter(it => it.visible).map(it => ({ instanceId: id, itemId: it.id }));
    const r = await saveSettings(draft => {
      draft.instances = draft.instances || [];
      draft.instances.push({
        id,
        provider: chosen,
        providerVersion: provider?.version || 1,
        name: name.trim() || provider?.name || chosen,
        config,
        items,
      });
      draft.displayOrder = [...(draft.displayOrder || []), ...newOrder];
    });
    setSaving(false);
    if (!r.ok) {
      if (!r.conflict) setSaveError(r.error || 'Save failed.');
      return;
    }
    onClose();
  }

  function setConfigField(key, val) {
    setConfig(prev => ({ ...prev, [key]: val }));
  }

  function inputTypeFor(field) {
    if (field.type === 'secret')  return 'password';
    if (field.type === 'email')   return 'email';
    if (field.type === 'url')     return 'url';
    return 'text';
  }

  const configComplete = provider
    ? provider.configSchema.every(f => !f.required || (typeof config[f.key] === 'string' && config[f.key].trim() !== ''))
    : false;

  // Toggle a child along with parent so users can dive deep quickly.
  function toggleNode(id, value) {
    setSelected(prev => ({ ...prev, [String(id)]: value }));
  }

  // Pre-compute parent → children map for the tree render.
  const childrenOf = useMemo(() => {
    const map = {};
    for (const n of nodes) {
      const p = n.parentId ?? null;
      if (p !== null) (map[String(p)] ||= []).push(n);
    }
    return map;
  }, [nodes]);
  const topNodes = useMemo(() => nodes.filter(n => (n.parentId ?? null) === null), [nodes]);

  return html`
    <div class="scrim" onClick=${onClose} />
    <div class="modal modal--wide" role="dialog" aria-label="Add instance">
      <h2>Add instance</h2>

      <div class="wizard-steps">
        ${[1,2,3].map(n => html`
          <div key=${n} class="wizard-step" data-active=${step === n ? 'true' : 'false'} data-done=${step > n ? 'true' : 'false'}>
            ${n}. ${n === 1 ? 'Provider' : n === 2 ? 'Configure' : 'Items'}
          </div>
        `)}
      </div>

      ${step === 1 && html`
        <div class="setting-list">
          ${provError && html`<p class="form-error">${provError}</p>`}
          ${providers === null && !provError && html`<p class="drawer-intro">Loading providers…</p>`}
          ${(providers || []).map(p => html`
            <label key=${p.id} class="provider-pick" data-active=${chosen === p.id ? 'true' : 'false'}>
              <input type="radio" name="provider" value=${p.id}
                     checked=${chosen === p.id}
                     onChange=${() => setChosen(p.id)} />
              <span>
                <b>${p.name}</b>
                <small>${p.configSchema.map(f => f.label).join(' · ')}</small>
              </span>
            </label>
          `)}
          <div class="modal-actions wizard-actions">
            <button class="btn" disabled=${!chosen} onClick=${() => setStep(2)}>Next</button>
            <button class="btn btn-ghost" onClick=${onClose}>Cancel</button>
          </div>
        </div>
      `}

      ${step === 2 && provider && html`
        <div>
          <div class="form-row">
            <label>Display name</label>
            <input class="input" type="text" placeholder=${provider.name}
                   value=${name} onInput=${e => setName(e.target.value)} />
          </div>
          ${provider.configSchema.map(f => html`
            <div class="form-row" key=${f.key}>
              <label>${f.label}${f.required ? ' *' : ''}</label>
              <input class="input" type=${inputTypeFor(f)}
                     value=${config[f.key] || ''}
                     onInput=${e => setConfigField(f.key, e.target.value)} />
              ${f.help && html`<small class="auth-method-sub">${f.help}</small>`}
            </div>
          `)}
          <${InlineError} message=${discoverError} />
          <div class="modal-actions wizard-actions">
            <button class="btn btn-ghost" onClick=${() => setStep(1)}>Back</button>
            <button class="btn" disabled=${!configComplete || discovering} onClick=${runDiscover}>
              ${discovering ? 'Testing…' : 'Test & discover'}
            </button>
          </div>
        </div>
      `}

      ${step === 3 && html`
        <div>
          <p class="drawer-intro">Found ${nodes.length} items. Uncheck anything you don't want to monitor.</p>
          <div class="catalog wizard-tree">
            ${topNodes.length === 0 && html`<p class="drawer-intro">No items returned.</p>`}
            ${topNodes.map(n => html`
              <div key=${n.id}>
                <div class="cat-row">
                  <input type="checkbox" class="checkbox" checked=${!!selected[String(n.id)]}
                         onChange=${e => toggleNode(n.id, e.target.checked)} />
                  <span class="label"><b>${n.label}</b></span>
                  <span class="hint">${n.hints || n.kind}</span>
                </div>
                ${(childrenOf[String(n.id)] || []).map(c => html`
                  <div key=${c.id} class="cat-row" data-child="true">
                    <input type="checkbox" class="checkbox" checked=${!!selected[String(c.id)]}
                           onChange=${e => toggleNode(c.id, e.target.checked)} />
                    <span class="label">${c.label}</span>
                    <span class="hint">${c.hints || c.kind}</span>
                  </div>
                `)}
              </div>
            `)}
          </div>
          <${InlineError} message=${saveError} />
          <div class="modal-actions wizard-actions">
            <button class="btn btn-ghost" onClick=${() => setStep(2)}>Back</button>
            <button class="btn" onClick=${commit} disabled=${saving}>
              ${saving ? 'Saving…' : 'Save instance'}
            </button>
          </div>
        </div>
      `}
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
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setMeta).catch(() => {});
  }, []);
  return html`
    <div class="scrim" onClick=${onClose} />
    <div class="modal modal--md" role="dialog" aria-label="About">
        <h2>About this status page</h2>
        <p>
          A fast, lightweight status page for self-hosted services.
          Vanilla PHP, vanilla JS, single JSON config. MIT licensed.
        </p>
        <dl class="about-stats">
          <div><dt>Version</dt><dd class="mono">${meta?.version || '—'}</dd></div>
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
