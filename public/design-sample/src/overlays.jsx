// overlays.jsx — settings drawer, login modal, onboarding overlay, about modal

const { useState: useStateO } = React;

/* ─── Settings drawer ─── */
function SettingsDrawer({ t, setTweak, onClose }) {
  const [tab, setTabRaw] = useStateO("appearance");
  const [previewing, setPreviewing] = useStateO(false);
  const data = window.STATUS_DATA;

  // Re-blur the scrim whenever the user leaves the Appearance tab.
  const setTab = (next) => { if (next !== "appearance") setPreviewing(false); setTabRaw(next); };

  // Wrap setTweak so any change flips previewing → scrim clears.
  const setTweakLive = (k, v) => { setPreviewing(true); setTweak(k, v); };

  return (
    <>
      <div className="scrim" data-previewing={String(previewing)} onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Settings">
        <div className="drawer-head">
          <h2>Settings</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="drawer-tabs">
          <button className="drawer-tab" data-active={tab === "appearance"} onClick={() => setTab("appearance")}>Appearance</button>
          <button className="drawer-tab" data-active={tab === "catalog"} onClick={() => setTab("catalog")}>Catalog</button>
          <button className="drawer-tab" data-active={tab === "order"} onClick={() => setTab("order")}>Display order</button>
          <button className="drawer-tab" data-active={tab === "auth"} onClick={() => setTab("auth")}>Auth</button>
        </div>
        <div className="drawer-body">
          {tab === "appearance" && <AppearanceTab t={t} setTweak={setTweakLive} />}
          {tab === "catalog"    && <CatalogTab data={data} />}
          {tab === "order"      && <OrderTab data={data} />}
          {tab === "auth"       && <AuthTab />}
        </div>
      </aside>
    </>
  );
}

/* ─── Appearance tab ─── */
function AppearanceTab({ t, setTweak }) {
  return (
    <div className="setting-list">
      <SettingRow label="View detail" hint="Compact cards or full element readouts.">
        <Segmented value={t.mode} options={["simple", "detailed"]} onChange={(v) => setTweak("mode", v)} />
      </SettingRow>
      <SettingRow label="Theme">
        <Segmented value={t.theme} options={["auto", "light", "dark"]} onChange={(v) => setTweak("theme", v)} />
      </SettingRow>
      <SettingRow label="Density" hint="Card padding and grid columns.">
        <Segmented value={t.density} options={["cozy", "regular", "airy"]} onChange={(v) => setTweak("density", v)} />
      </SettingRow>
      <SettingRow label="Card style">
        <Segmented value={t.cardstyle} options={["flat", "paper", "elev"]} onChange={(v) => setTweak("cardstyle", v)} />
      </SettingRow>
      <SettingRow label="Severity mark" hint="How non-ok cards stand out.">
        <Segmented value={t.mark} options={["stripe", "dot"]} onChange={(v) => setTweak("mark", v)} />
      </SettingRow>
      <SettingRow label="Accent" hint="Used for links and focus rings; status colors are fixed.">
        <Swatches value={t.accent}
                  options={[
                    ["mint",   "oklch(62% 0.14 150)"],
                    ["citron", "oklch(72% 0.14 95)"],
                    ["violet", "oklch(58% 0.16 285)"],
                    ["coral",  "oklch(66% 0.16 30)"],
                    ["ink",    "var(--ink)"],
                  ]}
                  onChange={(v) => setTweak("accent", v)} />
      </SettingRow>
      <SettingRow label="Show summary bar" hint="Stacked status legend in the hero.">
        <Switch on={t.showSummaryBar} onClick={() => setTweak("showSummaryBar", !t.showSummaryBar)} />
      </SettingRow>
      <SettingRow label="Sparklines" hint="Inline history under gauges and counters.">
        <Switch on={t.showSparklines} onClick={() => setTweak("showSparklines", !t.showSparklines)} />
      </SettingRow>
    </div>
  );
}

function SettingRow({ label, hint, children }) {
  return (
    <div className="setting-row">
      <div className="setting-row-l">
        <div className="setting-row-label">{label}</div>
        {hint && <div className="setting-row-hint">{hint}</div>}
      </div>
      <div className="setting-row-r">{children}</div>
    </div>
  );
}

function Segmented({ value, options, onChange }) {
  return (
    <div className="segmented segmented-sm" role="radiogroup">
      {options.map((o) => (
        <button key={o} role="radio" aria-checked={value === o} data-active={value === o}
                onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
}

function Swatches({ value, options, onChange }) {
  return (
    <div className="swatches">
      {options.map(([name, color]) => (
        <button key={name} className="swatch" data-active={value === name}
                onClick={() => onChange(name)} aria-label={name} title={name}>
          <span style={{ background: color }} />
        </button>
      ))}
    </div>
  );
}

function CatalogTab({ data }) {
  return (
    <div className="catalog">
      <p style={{ color: "var(--ink-3)", fontSize: 13, margin: "0 0 14px" }}>
        Toggle visibility and rename discovered items. Set thresholds per element.
      </p>
      {data.instances.map((inst) => {
        const items = data.items.filter((it) => it.instanceId === inst.id);
        return (
          <div className="cat-group" key={inst.id}>
            <div className="cat-group-h">
              <b>{inst.name}</b>
              <div className="actions">
                <button>Re-discover</button>
                <button>Edit</button>
                <button>Remove</button>
              </div>
            </div>
            {items.map((it) => {
              const isChild = it.itemId.includes("::");
              return (
                <div className="cat-row" key={it.itemId} data-child={String(isChild)}>
                  <input type="checkbox" className="checkbox" defaultChecked />
                  <span className="label">{it.displayName}</span>
                  <span className="hint mono">{it.itemId.split("::").slice(1).join("::") || it.providerId}</span>
                </div>
              );
            })}
          </div>
        );
      })}
      <button className="btn btn-ghost" style={{ marginTop: 14, justifyContent: "flex-start", width: "100%", border: ".5px dashed var(--line-2)" }}>
        + Add instance
      </button>
    </div>
  );
}

function OrderTab({ data }) {
  const visible = data.items;
  return (
    <div>
      <p style={{ color: "var(--ink-3)", fontSize: 13, margin: "0 0 14px" }}>
        Drag rows to reorder. Items can interleave across instances and providers.
      </p>
      <div className="draglist">
        {visible.map((it) => (
          <div className="drag-row" key={it.itemId}>
            <span className="grip"><Icon name="drag" /></span>
            <span style={{ flex: 1 }}>{it.displayName}</span>
            <span className="src">{it.providerId}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AuthTab() {
  const [methods, setMethods] = useStateO({
    form: true, basic: false, token: false, cert: false,
  });
  const toggle = (k) => setMethods((m) => ({ ...m, [k]: !m[k] }));
  const Row = ({ k, name, sub, badge }) => (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 0", borderBottom: ".5px solid var(--line)",
    }}>
      <div>
        <div style={{ fontWeight: 500, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          {name}
          {badge && <span className="chip">{badge}</span>}
        </div>
        <div style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 3 }}>{sub}</div>
      </div>
      <Switch on={methods[k]} onClick={() => toggle(k)} />
    </div>
  );
  return (
    <div>
      <p style={{ color: "var(--ink-3)", fontSize: 13, margin: "0 0 8px" }}>
        At least one method must remain enabled.
      </p>
      <Row k="form"  name="Session login"    sub="HTML form against bcrypt hash." badge="default" />
      <Row k="basic" name="HTTP Basic"       sub="Same password. For curl & scripts." />
      <Row k="token" name="Bearer token"     sub={<span>Reveal in <a href="#" onClick={(e)=>e.preventDefault()} style={{ color: "var(--accent)" }}>settings.json</a>. Rotatable.</span>} />
      <Row k="cert"  name="Client certificate" sub="Validated by Caddy; subject DN allowlist." />

      <h3 style={{ fontSize: 13, marginTop: 22, marginBottom: 8 }}>Change password</h3>
      <div className="form-row">
        <input className="input" type="password" placeholder="Current password" />
      </div>
      <div className="form-row">
        <input className="input" type="password" placeholder="New password (min 12)" />
      </div>
      <button className="btn">Update</button>
    </div>
  );
}

function Switch({ on, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        appearance: "none", border: 0, cursor: "pointer",
        width: 38, height: 22, borderRadius: 999,
        background: on ? "var(--ink)" : "var(--bg-sunk)",
        position: "relative", transition: "background 160ms ease",
      }}
      aria-pressed={on}
    >
      <span style={{
        position: "absolute", top: 2, left: on ? 18 : 2,
        width: 18, height: 18, borderRadius: 999,
        background: on ? "var(--bg)" : "var(--paper)",
        boxShadow: "0 1px 2px rgba(0,0,0,.12)",
        transition: "left 160ms cubic-bezier(.2,.7,.2,1)",
      }} />
    </button>
  );
}

/* ─── Login modal ─── */
function LoginModal({ onClose }) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-label="Sign in">
        <h2>Sign in</h2>
        <p>Authenticated admin access to settings, discovery, and threshold editing.</p>
        <div className="form-row">
          <label htmlFor="pw">Password</label>
          <input id="pw" className="input" type="password" autoFocus />
        </div>
        <button className="btn btn-block" onClick={onClose}>Continue</button>
        <p style={{ marginTop: 18, marginBottom: 0, fontSize: 12 }}>
          Forgot? Clear <span className="mono">auth.passwordHash</span> in <span className="mono">settings.json</span> to re-onboard.
        </p>
      </div>
    </>
  );
}

/* ─── Onboarding overlay (first-run) ─── */
function OnboardOverlay({ onClose }) {
  const [pw, setPw] = useStateO("");
  const [pw2, setPw2] = useStateO("");
  const ok = pw.length >= 12 && pw === pw2;
  return (
    <>
      <div className="scrim" />
      <div className="modal" role="dialog" aria-label="First-run setup" style={{ width: "min(520px, calc(100vw - 32px))" }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: "var(--accent)", color: "var(--bg)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          marginBottom: 14,
        }}>
          <Icon name="bolt" width="22" height="22" />
        </div>
        <h2>Welcome to your status page</h2>
        <p>
          Set an admin password to unlock settings and discovery. The public status view becomes available immediately after.
        </p>
        <div className="form-row">
          <label>Admin password</label>
          <input className="input" type="password" value={pw} onChange={(e)=>setPw(e.target.value)} placeholder="At least 12 characters" />
        </div>
        <div className="form-row">
          <label>Confirm</label>
          <input className="input" type="password" value={pw2} onChange={(e)=>setPw2(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button className="btn btn-block" disabled={!ok} style={{ opacity: ok ? 1 : .35 }} onClick={onClose}>
            Set password & continue
          </button>
        </div>
        <p style={{ marginTop: 18, marginBottom: 0, color: "var(--ink-4)", fontSize: 12 }}>
          Hashed with bcrypt. Stored in <span className="mono">config/settings.json</span>. No telemetry, no external services.
        </p>
      </div>
    </>
  );
}

/* ─── About modal ─── */
function AboutModal({ onClose }) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-label="About" style={{ width: "min(480px, calc(100vw - 32px))" }}>
        <h2>About this status page</h2>
        <p>
          A fast, lightweight status page for self-hosted services. Vanilla PHP, vanilla JS, single JSON config.
          Source-available under MIT.
        </p>
        <dl className="about-stats">
          <div><dt>Version</dt><dd className="mono">1.0.0</dd></div>
          <div><dt>Uptime</dt><dd>14d 02h</dd></div>
          <div><dt>Providers</dt><dd>Beszel, UptimeRobot</dd></div>
          <div><dt>Items</dt><dd>12 visible</dd></div>
        </dl>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="link-btn" href="#" onClick={(e)=>e.preventDefault()}>Documentation <Icon name="external" /></a>
          <a className="link-btn" href="#" onClick={(e)=>e.preventDefault()}>Source on GitHub <Icon name="external" /></a>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { SettingsDrawer, LoginModal, OnboardOverlay, AboutModal });
