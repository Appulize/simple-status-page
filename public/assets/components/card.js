import { html } from 'htm/preact';
import { Icon } from '/assets/icons.js';
import { GaugeEl, CounterEl, UptimeEl, BooleanEl, TextEl, EventsEl, LinkEl, fmtRelative } from '/assets/components/elements.js';

function groupElements(elements) {
  const out = [];
  let bucket = [];
  const flush = () => { if (bucket.length) { out.push({ kind: 'row', items: bucket }); bucket = []; } };
  for (const el of elements) {
    if (el.type === 'gauge' || el.type === 'counter') {
      bucket.push(el);
    } else {
      flush();
      out.push({ kind: el.type, el });
    }
  }
  flush();
  return out;
}

export function ItemCard({ item }) {
  const groups = groupElements(item.elements || []);
  const isActive = !item.state || item.state === 'active';

  return html`
    <article class="card" data-severity=${item.severity || 'ok'} data-state=${item.state || 'active'}>
      <header class="card-head">
        <div class="card-title">
          <span class="sev-dot" aria-hidden="true"></span>
          <div class="card-title-inner">
            <h3>${item.displayName}</h3>
            <div class="card-sub"><span>${item.statusText}</span></div>
          </div>
        </div>
        ${!isActive
          ? html`<span class="chip chip-state" data-state=${item.state}>${item.state}</span>`
          : (item.severity === 'degraded' || item.severity === 'down')
            ? html`<span class="chip chip-state" data-severity=${item.severity}>${item.severity}</span>`
            : null}
      </header>

      <div class="card-body">
        ${item.severity === 'down' && isActive && html`
          <div class="down-banner">
            <${Icon} name="alert" />
            <div>
              <b>Monitor unreachable</b>
              <small>${item.error || 'Health probe failed.'}</small>
            </div>
          </div>
        `}
        ${item.state === 'paused' && html`
          <div class="muted-banner">
            <${Icon} name="pause" />
            <div><b>Paused</b><small>${item.statusText}</small></div>
          </div>
        `}
        ${item.state === 'maintenance' && html`
          <div class="muted-banner">
            <${Icon} name="wrench" />
            <div><b>Scheduled maintenance</b><small>${item.statusText}</small></div>
          </div>
        `}

        ${groups.map((g, i) => {
          if (g.kind === 'row') {
            const cols = Math.min(3, g.items.length);
            return html`
              <div class="elements-row card-bigvals" key=${i} data-cols=${cols}>
                ${g.items.map((el, j) =>
                  el.type === 'gauge'
                    ? html`<${GaugeEl}   el=${el} key=${j} />`
                    : html`<${CounterEl} el=${el} key=${j} />`
                )}
              </div>
            `;
          }
          if (g.kind === 'uptime')  return html`<${UptimeEl}  el=${g.el} key=${i} />`;
          if (g.kind === 'boolean') return html`<${BooleanEl} el=${g.el} key=${i} />`;
          if (g.kind === 'text')    return html`<${TextEl}    el=${g.el} key=${i} />`;
          if (g.kind === 'events')  return html`<${EventsEl}  el=${g.el} key=${i} />`;
          if (g.kind === 'link')    return html`<${LinkEl}    el=${g.el} key=${i} />`;
          return null;
        })}
      </div>

      <footer class="card-foot">
        <span>Last seen ${fmtRelative(item.lastSeenAt)}</span>
        ${item.error && item.severity !== 'down'
          ? html`<span class="err">${item.error}</span>`
          : html`<span class="mono card-foot-provider">${item.providerId}</span>`}
      </footer>
    </article>
  `;
}
