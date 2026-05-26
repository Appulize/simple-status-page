// app.jsx — root, hero summary, grid, overlay manager.

const { useState, useEffect, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "mode": "simple",
  "theme": "auto",
  "accent": "mint",
  "density": "regular",
  "cardstyle": "paper",
  "mark": "stripe",
  "showStale": false,
  "showSparklines": true,
  "showSummaryBar": true,
  "overlay": "none"
}/*EDITMODE-END*/;

function resolveTheme(theme) {
  if (theme !== "auto") return theme;
  return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
}

function applyTheme(t) {
  const html = document.documentElement;
  html.setAttribute("data-theme", resolveTheme(t.theme));
  html.setAttribute("data-theme-pref", t.theme);
  html.setAttribute("data-accent", t.accent);
  html.setAttribute("data-density", t.density);
  html.setAttribute("data-cardstyle", t.cardstyle);
  html.setAttribute("data-mark", t.mark);
  html.setAttribute("data-mode", t.mode);
  html.setAttribute("data-sparklines", String(!!t.showSparklines));
}

function severitySummary(items) {
  const counts = { ok: 0, warn: 0, down: 0, paused: 0, unknown: 0 };
  for (const it of items) {
    if (it.state === "paused" || it.state === "maintenance") counts.paused++;
    else if (it.state === "unknown") counts.unknown++;
    else if (it.severity === "down") counts.down++;
    else if (it.severity === "warn") counts.warn++;
    else counts.ok++;
  }
  const total = items.length || 1;
  return { ...counts, total };
}

function heroHeadline(s) {
  if (s.down > 0) return { tone: "down", text: <>{s.down} service{s.down>1?"s":""} <em>are down.</em></> };
  if (s.warn > 0) return { tone: "warn", text: <>{s.warn} service{s.warn>1?"s":""} <em>are degraded.</em></> };
  if (s.paused > 0) return { tone: "ok", text: <>All active services <em>operational.</em></> };
  return { tone: "ok", text: <>All services <em>operational.</em></> };
}

function Countdown({ seconds = 30 }) {
  const [n, setN] = useState(seconds);
  useEffect(() => {
    const id = setInterval(() => setN((v) => (v <= 1 ? seconds : v - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds]);
  return <span>{String(n).padStart(2, "0")}s</span>;
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [now, setNow] = useState(Date.now());
  const [overlay, setOverlay] = useState(t.overlay && t.overlay !== "none" ? t.overlay : null);

  useEffect(() => { applyTheme(t); }, [t.theme, t.accent, t.density, t.cardstyle, t.mark, t.mode, t.showSparklines]);

  // When theme is 'auto', track system pref changes live.
  useEffect(() => {
    if (t.theme !== "auto" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(t);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [t.theme]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  // Listen for keyboard shortcut: Esc closes overlay
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") setOverlay(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // React to tweak-driven overlay changes
  useEffect(() => {
    if (t.overlay === "none") setOverlay(null);
    else if (t.overlay) setOverlay(t.overlay);
  }, [t.overlay]);

  const data = window.STATUS_DATA;
  const items = data.items;
  const s = useMemo(() => severitySummary(items), [items]);
  const headline = heroHeadline(s);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="bolt" />
          </span>
          <span>Status <small>· {data.meta.title}</small></span>
        </div>
        <div className="segmented" role="tablist" aria-label="View detail">
          <button role="tab" aria-selected={t.mode === "simple"} data-active={t.mode === "simple"}
                  onClick={() => setTweak("mode", "simple")}>Simple</button>
          <button role="tab" aria-selected={t.mode === "detailed"} data-active={t.mode === "detailed"}
                  onClick={() => setTweak("mode", "detailed")}>Detailed</button>
        </div>
        <div className="toptools">
          <button className="iconbtn" aria-label="Toggle theme"
                  onClick={() => {
                    const resolved = resolveTheme(t.theme);
                    setTweak("theme", resolved === "dark" ? "light" : "dark");
                  }}>
            <Icon name={resolveTheme(t.theme) === "dark" ? "sun" : "moon"} />
          </button>
          <button className="iconbtn" aria-label="Sign in" onClick={() => setOverlay("login")}>
            <Icon name="lock" />
          </button>
          <button className="iconbtn" aria-label="Settings" onClick={() => setOverlay("settings")}>
            <Icon name="cog" />
          </button>
          <button className="menuchip" onClick={() => setOverlay("about")}>
            <Icon name="info" width="14" height="14" />
            <span>About</span>
            <span className="menuchip-countdown"><Countdown seconds={30} /></span>
          </button>
        </div>
      </header>

      <section className="hero" data-incident={s.down > 0 ? "true" : "false"}>
        <div className="hero-eyebrow" data-state={headline.tone}>
          <span className="pulse" />
          <span>{
            headline.tone === "down" ? "Incident in progress" :
            headline.tone === "warn" ? "Degraded performance" :
            "All systems normal"
          }</span>
        </div>
        <h1 className="hero-headline">{headline.text}</h1>
        <div className="hero-row">
          <dl className="hero-meta">
            <div>
              <dt>Operational</dt>
              <dd>{s.ok} <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>/ {s.total}</span></dd>
            </div>
            <div><dt>Degraded</dt><dd>{s.warn}</dd></div>
            <div><dt>Down</dt><dd>{s.down}</dd></div>
            <div><dt>Paused</dt><dd>{s.paused}</dd></div>
            <div><dt>Last update</dt><dd>just now</dd></div>
          </dl>
          {t.showSummaryBar && (
            <div style={{ flex: "1 1 240px", maxWidth: 380, minWidth: 220 }}>
              <div className="stackbar">
                {s.ok    > 0 && <span className="sb-ok"    style={{ width: `${s.ok    /s.total*100}%` }} />}
                {s.warn  > 0 && <span className="sb-warn"  style={{ width: `${s.warn  /s.total*100}%` }} />}
                {s.down  > 0 && <span className="sb-down"  style={{ width: `${s.down  /s.total*100}%` }} />}
                {s.paused> 0 && <span className="sb-paused"style={{ width: `${s.paused/s.total*100}%` }} />}
              </div>
              <div className="stack-legend">
                <span><i style={{ background: "var(--ok)" }} />Operational</span>
                <span><i style={{ background: "var(--warn)" }} />Degraded</span>
                <span><i style={{ background: "var(--down)" }} />Down</span>
                <span><i style={{ background: "var(--paused)", opacity: .5 }} />Paused</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {t.showStale && (
        <div className="stale" role="status">
          <Icon name="alert" />
          <span>Showing cached data from <b>2 min ago</b>. Beszel · Production is unreachable; retrying in 38s.</span>
        </div>
      )}

      <div className="section-h">
        <h2>Services</h2>
        <small>{items.length} items · refreshes every 30s</small>
      </div>
      <div className="grid">
        {items.map((it) => <ItemCard key={it.instanceId + ":" + it.itemId} item={it} />)}
      </div>

      <footer className="footer">
        <span>© 2026 · <span className="mono">status.swic.name</span></span>
        <span className="footer-links">
          <a href="#" onClick={(e)=>{e.preventDefault();setOverlay("about");}}>About</a>
          <a href="#" onClick={(e)=>e.preventDefault()}>Health</a>
          <a href="#" onClick={(e)=>e.preventDefault()}>RSS</a>
          <a href="#" onClick={(e)=>e.preventDefault()}>JSON</a>
        </span>
      </footer>

      {/* Overlays */}
      {overlay === "settings"   && <SettingsDrawer t={t} setTweak={setTweak} onClose={() => { setOverlay(null); setTweak("overlay", "none"); }} />}
      {overlay === "login"      && <LoginModal     onClose={() => { setOverlay(null); setTweak("overlay", "none"); }} />}
      {overlay === "onboard"    && <OnboardOverlay onClose={() => { setOverlay(null); setTweak("overlay", "none"); }} />}
      {overlay === "about"      && <AboutModal     onClose={() => { setOverlay(null); setTweak("overlay", "none"); }} />}

      {/* Tweaks panel */}
      <TweaksPanel>
        <TweakSection label="Overlay preview" />
        <TweakSelect label="Show"
                     value={overlay || "none"}
                     options={["none", "settings", "login", "onboard", "about"]}
                     onChange={(v) => { setOverlay(v === "none" ? null : v); setTweak("overlay", v); }} />
        <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "6px 8px 0" }}>
          Appearance controls live in <b>Settings → Appearance</b>.
        </p>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
