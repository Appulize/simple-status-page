// card.jsx — Card composer + grouped element layout.

/* Group elements into rows: gauges/counters cluster in one row;
   uptime, boolean, text, events, link each get a row. */
function groupElements(elements) {
  const out = [];
  let bucket = [];
  const flushBucket = () => {
    if (bucket.length) { out.push({ kind: "row", items: bucket }); bucket = []; }
  };
  for (const el of elements) {
    if (el.type === "gauge" || el.type === "counter") {
      bucket.push(el);
    } else {
      flushBucket();
      out.push({ kind: el.type, el });
    }
  }
  flushBucket();
  return out;
}

function ItemCard({ item }) {
  const isDown = item.severity === "down" || item.state === "unknown";
  const isMuted = item.state === "paused" || item.state === "maintenance";
  const groups = groupElements(item.elements || []);

  return (
    <article
      className="card"
      data-severity={item.severity || "ok"}
      data-state={item.state || "active"}
    >
      <header className="card-head">
        <div className="card-title">
          <span className="sev-dot" aria-hidden="true"></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3>{item.displayName}</h3>
            <div className="card-sub">
              <span>{item.statusText}</span>
            </div>
          </div>
        </div>
        {(item.state && item.state !== "active") ? (
          <span className="chip chip-state" data-state={item.state}>
            {item.state}
          </span>
        ) : item.severity === "warn" ? (
          <span className="chip chip-state" style={{ color: "var(--warn-ink)", background: "var(--warn-soft)" }}>degraded</span>
        ) : item.severity === "down" ? (
          <span className="chip chip-state" style={{ color: "var(--down-ink)", background: "var(--down-soft)" }}>down</span>
        ) : null}
      </header>

      <div className="card-body">
        {item.severity === "down" && (
          <div className="down-banner">
            <Icon name="alert" />
            <div>
              <b>Service unreachable</b>
              <small>{item.error || "Health probe failed."}</small>
            </div>
          </div>
        )}
        {item.state === "paused" && (
          <div className="muted-banner">
            <Icon name="pause" />
            <div>
              <b>Paused</b>
              <small>{item.statusText}</small>
            </div>
          </div>
        )}
        {item.state === "maintenance" && (
          <div className="muted-banner">
            <Icon name="wrench" />
            <div>
              <b>Scheduled maintenance</b>
              <small>{item.statusText}</small>
            </div>
          </div>
        )}

        {groups.map((g, i) => {
          if (g.kind === "row") {
            const cols = Math.min(3, g.items.length);
            return (
              <div className="elements-row card-bigvals" key={i}
                   style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {g.items.map((el, j) => (
                  el.type === "gauge"
                    ? <GaugeEl el={el} key={j} />
                    : <CounterEl el={el} key={j} />
                ))}
              </div>
            );
          }
          if (g.kind === "uptime")  return <UptimeEl  el={g.el} key={i} />;
          if (g.kind === "boolean") {
            // Group consecutive booleans inline
            return <BooleanEl el={g.el} key={i} />;
          }
          if (g.kind === "text")   return <TextEl   el={g.el} key={i} />;
          if (g.kind === "events") return <EventsEl el={g.el} key={i} />;
          if (g.kind === "link")   return <LinkEl   el={g.el} key={i} />;
          return null;
        })}
      </div>

      <footer className="card-foot">
        <span>Last seen {fmtRelative(item.lastSeenAt)}</span>
        {item.error && item.severity !== "down" && <span className="err">{item.error}</span>}
        {!item.error && <span className="mono" style={{ color: "var(--ink-4)" }}>{item.providerId}</span>}
      </footer>
    </article>
  );
}

Object.assign(window, { ItemCard, groupElements });
