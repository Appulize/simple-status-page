import { html, useMemo } from 'htm/preact';
import { Icon } from '/assets/icons.js';

export const fmtRelative = (ts) => {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (diff < 60)       return `${diff}s ago`;
  if (diff < 3600)     return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)    return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export const fmtNum = (n, decimals = 0) => {
  if (n == null) return '—';
  return Number(n).toFixed(decimals);
};

export const fmtTime = (ts) =>
  new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const severityOf = (val, t) => {
  if (!t) return null;
  if (t.crit != null && val >= t.crit) return 'crit';
  if (t.warn != null && val >= t.warn) return 'warn';
  return null;
};

export function Sparkline({ values, severity, height = 28 }) {
  const path = useMemo(() => {
    if (!values || values.length < 2) return null;
    const w = 200, h = height;
    const min = Math.min(...values), max = Math.max(...values);
    const span = Math.max(1, max - min);
    const stepX = w / (values.length - 1);
    const pad = 2;
    const pts = values.map((v, i) => [
      i * stepX,
      pad + (h - pad * 2) * (1 - (v - min) / span),
    ]);
    const line = pts.map(([x, y], i) =>
      `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const fill = `${line} L${w} ${h} L0 ${h} Z`;
    return { line, fill, last: pts[pts.length - 1] };
  }, [values, height]);

  if (!path) return null;
  return html`
    <svg class="spark" viewBox=${`0 0 200 ${height}`} preserveAspectRatio="none" data-sev=${severity || ''}>
      <path class="fill" d=${path.fill} />
      <path class="line" d=${path.line} />
      <circle class="dot" cx=${path.last[0]} cy=${path.last[1]} r="1.5" />
    </svg>
  `;
}

export function GaugeEl({ el }) {
  const sev = el.severity || severityOf(el.value, el.thresholds);
  const pct = Math.max(0, Math.min(100, el.value / (el.max || 100) * 100));
  return html`
    <div class="bigval" data-sev=${sev || ''}>
      <div class="bigval-label">${el.label}</div>
      <div class="bigval-num">
        <span>${fmtNum(el.value, el.value < 10 ? 1 : 0)}</span>
        <small>${el.unit}</small>
      </div>
      <div class="gaugebar"><i style=${{ width: `${pct}%` }} /></div>
      ${el.history && html`<${Sparkline} values=${el.history.values} severity=${sev} />`}
    </div>
  `;
}

export function CounterEl({ el }) {
  const sev = el.severity || severityOf(el.value, el.thresholds);
  return html`
    <div class="bigval" data-sev=${sev || ''}>
      <div class="bigval-label">${el.label}</div>
      <div class="bigval-num">
        <span>${fmtNum(el.value, 0)}</span>
        <small>${el.unit}</small>
      </div>
      ${el.history && html`<${Sparkline} values=${el.history.values} severity=${sev} />`}
    </div>
  `;
}

export function UptimeEl({ el }) {
  return html`
    <div class="uptime">
      ${el.windows.map((w, i) => {
        const sev = w.ratio < 95 ? 'crit' : w.ratio < 99 ? 'warn' : null;
        return html`
          <div class="uptime-cell" key=${i} data-sev=${sev || ''}>
            <div class="uptime-label">${w.label}</div>
            <div class="uptime-pct">${w.ratio.toFixed(w.ratio === 100 ? 0 : 2)}%</div>
            <div class="uptime-bar"><i style=${{ width: `${w.ratio}%` }} /></div>
          </div>
        `;
      })}
    </div>
  `;
}

export function BooleanEl({ el }) {
  return html`
    <div class="check" data-pass=${String(el.value)}>
      <span class="check-mark">
        <${Icon} name=${el.value ? 'check' : 'x'} />
      </span>
      <span class="check-label">${el.label}</span>
      ${el.value && el.trueLabel  && html`<span class="check-value">${el.trueLabel}</span>`}
      ${!el.value && el.falseLabel && html`<span class="check-value">${el.falseLabel}</span>`}
    </div>
  `;
}

export function TextEl({ el }) {
  return html`
    <dl class="txt-rows">
      ${el.rows.map((r, i) => [
        html`<dt key=${`${i}dt`}>${r.label}</dt>`,
        html`<dd key=${`${i}dd`} class=${r.mono ? 'mono' : ''}>${r.value}</dd>`,
      ])}
    </dl>
  `;
}

export function EventsEl({ el }) {
  return html`
    <div class="events">
      ${el.items.map((e, i) => html`
        <div class="event" key=${i} data-sev=${e.severity}>
          <span class="event-tick" />
          <span class="event-time">${fmtRelative(e.t)}</span>
          <span class="event-title">${e.title}</span>
          <span class="event-dur">${e.durationSec ? `${e.durationSec}s` : ''}</span>
        </div>
      `)}
    </div>
  `;
}

export function LinkEl({ el }) {
  return html`
    <div class="links">
      <a class="link-btn" href=${el.href} onClick=${(e) => e.preventDefault()}>
        ${el.label}
        ${el.external && html`<${Icon} name="external" />`}
      </a>
    </div>
  `;
}
