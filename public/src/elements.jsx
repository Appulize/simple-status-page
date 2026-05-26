// elements.jsx — renderers for each element type from PLAN §4.
// All components attached to window for cross-script use.

const { useMemo } = React;

/* ─── icons ─── */
function Icon({ name, ...rest }) {
  const paths = {
    sun:   <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
    moon:  <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></>,
    cog:   <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    info:  <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></>,
    lock:  <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    grid:  <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></>,
    check: <path d="M5 12l5 5L20 7"/>,
    x:     <><path d="M18 6L6 18M6 6l12 12"/></>,
    arrow: <><path d="M7 17L17 7M17 7H9M17 7v8"/></>,
    alert: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></>,
    pause: <><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></>,
    wrench:<><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94L9 17.9a2.12 2.12 0 0 1-3-3l8.4-8.4a6 6 0 0 1 7.94-7.94L18.6 2.3 14.7 6.3z"/></>,
    refresh: <><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></>,
    drag: <><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></>,
    external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></>,
    bolt: <><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {paths[name]}
    </svg>
  );
}

/* ─── tiny utils ─── */
const fmtRelative = (ts) => {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (diff < 60)        return `${diff}s ago`;
  if (diff < 60*60)     return `${Math.floor(diff/60)}m ago`;
  if (diff < 60*60*24)  return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
};

const fmtNum = (n, decimals = 0) => {
  if (n == null) return "—";
  const s = Number(n).toFixed(decimals);
  return s;
};

const fmtTime = (ts) => {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const severityOf = (val, t) => {
  if (!t) return null;
  if (t.crit != null && val >= t.crit) return "crit";
  if (t.warn != null && val >= t.warn) return "warn";
  return null;
};

/* ─── Sparkline (inline SVG, no library) ─── */
function Sparkline({ values, severity, height = 28 }) {
  const path = useMemo(() => {
    if (!values || values.length < 2) return { line: "", fill: "" };
    const w = 200, h = height;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    const stepX = w / (values.length - 1);
    const pad = 2;
    const pts = values.map((v, i) => {
      const x = i * stepX;
      const y = pad + (h - pad * 2) * (1 - (v - min) / span);
      return [x, y];
    });
    const line = pts.map(([x, y], i) => (i === 0 ? `M${x.toFixed(1)} ${y.toFixed(1)}` : `L${x.toFixed(1)} ${y.toFixed(1)}`)).join(" ");
    const fill = `${line} L${w} ${h} L0 ${h} Z`;
    return { line, fill, last: pts[pts.length - 1] };
  }, [values, height]);

  if (!path.line) return null;
  return (
    <svg className="spark" viewBox={`0 0 200 ${height}`} preserveAspectRatio="none" data-sev={severity || ""}>
      <path className="fill" d={path.fill} />
      <path className="line" d={path.line} />
      {path.last && <circle className="dot" cx={path.last[0]} cy={path.last[1]} r="1.5" />}
    </svg>
  );
}

/* ─── Gauge (linear bar variant) ─── */
function GaugeEl({ el }) {
  const sev = el.severity || severityOf(el.value, el.thresholds);
  const pct = Math.max(0, Math.min(100, el.value / (el.max || 100) * 100));
  return (
    <div className="bigval" data-sev={sev || ""}>
      <div className="bigval-label">{el.label}</div>
      <div className="bigval-num">
        <span>{fmtNum(el.value, el.value < 10 ? 1 : 0)}</span>
        <small>{el.unit}</small>
      </div>
      <div className="gaugebar"><i style={{ width: `${pct}%` }} /></div>
      {el.history && <Sparkline values={el.history.values} severity={sev} />}
    </div>
  );
}

/* ─── Counter ─── */
function CounterEl({ el }) {
  const sev = el.severity || severityOf(el.value, el.thresholds);
  return (
    <div className="bigval" data-sev={sev || ""}>
      <div className="bigval-label">{el.label}</div>
      <div className="bigval-num">
        <span>{fmtNum(el.value, 0)}</span>
        <small>{el.unit}</small>
      </div>
      {el.history && <Sparkline values={el.history.values} severity={sev} />}
    </div>
  );
}

/* ─── Uptime windows ─── */
function UptimeEl({ el }) {
  return (
    <div className="uptime">
      {el.windows.map((w, i) => {
        const sev = w.ratio < 95 ? "crit" : w.ratio < 99 ? "warn" : null;
        return (
          <div className="uptime-cell" key={i} data-sev={sev || ""}>
            <div className="uptime-label">{w.label}</div>
            <div className="uptime-pct">{w.ratio.toFixed(w.ratio === 100 ? 0 : 2)}%</div>
            <div className="uptime-bar"><i style={{ width: `${w.ratio}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Boolean check rows ─── */
function BooleanEl({ el }) {
  return (
    <div className="check" data-pass={String(el.value)}>
      <span className="check-mark">
        <Icon name={el.value ? "check" : "x"} />
      </span>
      <span className="check-label">{el.label}</span>
      {el.value && el.trueLabel && <span className="check-value">{el.trueLabel}</span>}
      {!el.value && el.falseLabel && <span className="check-value">{el.falseLabel}</span>}
    </div>
  );
}

/* ─── Text rows ─── */
function TextEl({ el }) {
  return (
    <dl className="txt-rows">
      {el.rows.map((r, i) => (
        <React.Fragment key={i}>
          <dt>{r.label}</dt>
          <dd className={r.mono ? "mono" : ""}>{r.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/* ─── Events timeline ─── */
function EventsEl({ el }) {
  return (
    <div className="events">
      {el.items.map((e, i) => (
        <div className="event" key={i} data-sev={e.severity}>
          <span className="event-tick" />
          <span className="event-time">{fmtRelative(e.t)}</span>
          <span className="event-title">{e.title}</span>
          <span className="event-dur">{e.durationSec ? `${e.durationSec}s` : ""}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Link ─── */
function LinkEl({ el }) {
  return (
    <div className="links">
      <a className="link-btn" href={el.href} onClick={(e) => e.preventDefault()}>
        {el.label}
        {el.external && <Icon name="external" />}
      </a>
    </div>
  );
}

Object.assign(window, {
  Icon, Sparkline,
  GaugeEl, CounterEl, UptimeEl, BooleanEl, TextEl, EventsEl, LinkEl,
  fmtRelative, fmtTime, fmtNum,
});
