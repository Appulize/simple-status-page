// data.js — fixture items for the status page mock.
// Mirrors the NormalizedItem shape from PLAN.md §4.

(function () {
  // Deterministic-ish sparkline generators
  const rng = (seed) => {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  };
  const series = (n, base, amp, seed, drift = 0) => {
    const r = rng(seed);
    return Array.from({ length: n }, (_, i) => {
      const noise = (r() - 0.5) * amp;
      const trend = (i / n) * drift;
      return Math.max(0, Math.min(100, base + noise + trend));
    }).map((v) => Math.round(v * 10) / 10);
  };

  const NOW = Math.floor(Date.now() / 1000);

  window.STATUS_DATA = {
    meta: {
      title: "infra.swic.name",
      subtitle: "Self-hosted infrastructure status",
      generatedAt: NOW,
      freshness: "fresh",
      staleSince: null,
      instanceErrors: {},
    },
    instances: [
      { id: "i-bes", provider: "beszel", name: "Beszel · Production" },
      { id: "i-ur",  provider: "uptimerobot", name: "UptimeRobot · Edge" },
    ],
    items: [
      // ── 1. host card, healthy
      {
        instanceId: "i-bes", providerId: "beszel",
        itemId: "sys_api1",
        displayName: "api.prod-01",
        state: "active", severity: "ok",
        statusText: "Operational",
        lastSeenAt: NOW - 14,
        elements: [
          { type: "gauge", key: "cpu",  label: "CPU",  value: 23, unit: "%", max: 100, history: { intervalSec: 60, values: series(40, 22, 14, 1) } },
          { type: "gauge", key: "mem",  label: "RAM",  value: 67, unit: "%", max: 100, history: { intervalSec: 60, values: series(40, 64, 8, 2, 6) } },
          { type: "gauge", key: "disk", label: "Disk", value: 41, unit: "%", max: 100 },
          { type: "text",  rows: [
            { label: "Host",   value: "api.prod-01.swic.name", mono: true },
            { label: "Kernel", value: "Linux 6.6.14", mono: true },
            { label: "Uptime", value: "47d 14h" },
          ]},
        ],
      },

      // ── 2. host card, degraded (RAM warn)
      {
        instanceId: "i-bes", providerId: "beszel",
        itemId: "sys_db1",
        displayName: "db.primary",
        state: "active", severity: "warn",
        statusText: "Memory pressure",
        lastSeenAt: NOW - 9,
        elements: [
          { type: "gauge", key: "cpu", label: "CPU", value: 71, unit: "%", max: 100, history: { intervalSec: 60, values: series(40, 68, 18, 3, 10) } },
          { type: "gauge", key: "mem", label: "RAM", value: 89, unit: "%", max: 100, severity: "warn", thresholds: { warn: 80, crit: 95 }, history: { intervalSec: 60, values: series(40, 84, 8, 4, 8) } },
          { type: "gauge", key: "disk", label: "Disk", value: 62, unit: "%", max: 100 },
          { type: "events", items: [
            { t: NOW - 60*9,  title: "Slow query log threshold", severity: "warn" },
            { t: NOW - 60*86, title: "Background analyze finished", severity: "info", durationSec: 312 },
          ]},
        ],
      },

      // ── 3. disk sub-item card
      {
        instanceId: "i-bes", providerId: "beszel",
        itemId: "sys_api1::disk::/var",
        displayName: "/var",
        state: "active", severity: "warn",
        statusText: "Approaching threshold",
        lastSeenAt: NOW - 14,
        elements: [
          { type: "gauge", key: "disk", label: "Used", value: 87.4, unit: "%", max: 100, severity: "warn", thresholds: { warn: 85, crit: 95 }, history: { intervalSec: 3600, values: series(48, 78, 4, 7, 9) } },
          { type: "text", rows: [
            { label: "Mount", value: "/var", mono: true },
            { label: "FS",    value: "ext4" },
            { label: "Total", value: "120 GB" },
            { label: "Free",  value: "15.1 GB" },
          ]},
        ],
      },

      // ── 4. uptime monitor card, healthy
      {
        instanceId: "i-ur", providerId: "uptimerobot",
        itemId: "mon_42",
        displayName: "status.swic.name",
        state: "active", severity: "ok",
        statusText: "All checks passing",
        lastSeenAt: NOW - 21,
        elements: [
          { type: "counter", key: "response_time", label: "Response", value: 142, unit: "ms",
            history: { intervalSec: 300, values: series(40, 140, 60, 5) } },
          { type: "uptime", windows: [
            { label: "1d",  ratio: 100 },
            { label: "7d",  ratio: 99.98 },
            { label: "30d", ratio: 99.94 },
            { label: "90d", ratio: 99.91 },
          ]},
          { type: "link", label: "Open monitor", href: "#", external: true },
        ],
      },

      // ── 5. uptime card with mild incidents
      {
        instanceId: "i-ur", providerId: "uptimerobot",
        itemId: "mon_43",
        displayName: "cdn.assets",
        state: "active", severity: "ok",
        statusText: "Operational",
        lastSeenAt: NOW - 14,
        elements: [
          { type: "counter", key: "response_time", label: "Response", value: 89, unit: "ms",
            history: { intervalSec: 300, values: series(40, 92, 35, 9) } },
          { type: "uptime", windows: [
            { label: "1d",  ratio: 100 },
            { label: "7d",  ratio: 100 },
            { label: "30d", ratio: 99.99 },
            { label: "90d", ratio: 99.97 },
          ]},
          { type: "events", items: [
            { t: NOW - 60*60*32, title: "Edge POP fra-1 brief 502", severity: "warn", durationSec: 47 },
          ]},
        ],
      },

      // ── 6. DOWN card
      {
        instanceId: "i-bes", providerId: "beszel",
        itemId: "sys_vault",
        displayName: "vault.kv",
        state: "active", severity: "down",
        statusText: "Host reported down",
        lastSeenAt: NOW - 240,
        error: "Connection refused for 3m 58s",
        elements: [
          { type: "text", rows: [
            { label: "Host",     value: "vault.swic.name", mono: true },
            { label: "Last seen","value": "4m ago" },
            { label: "Attempts", value: "12" },
          ]},
          { type: "events", items: [
            { t: NOW - 60*4, title: "Health probe → connection refused", severity: "error" },
            { t: NOW - 60*7, title: "Health probe → connection refused", severity: "error" },
            { t: NOW - 60*9, title: "TLS handshake timeout", severity: "error" },
          ]},
        ],
      },

      // ── 7. SSL / mail card with booleans
      {
        instanceId: "i-ur", providerId: "uptimerobot",
        itemId: "mon_smtp",
        displayName: "mail.smtp",
        state: "active", severity: "ok",
        statusText: "Port 587 reachable",
        lastSeenAt: NOW - 8,
        elements: [
          { type: "counter", key: "response_time", label: "TLS handshake", value: 184, unit: "ms",
            history: { intervalSec: 300, values: series(40, 180, 60, 11) } },
          { type: "boolean", key: "tls",  label: "TLS 1.3 negotiated",     value: true },
          { type: "boolean", key: "cert", label: "Certificate valid",      value: true, trueLabel: "92 days left" },
          { type: "boolean", key: "spf",  label: "SPF record present",     value: true },
          { type: "boolean", key: "dkim", label: "DKIM signing key",       value: true },
        ],
      },

      // ── 8. paused monitor
      {
        instanceId: "i-ur", providerId: "uptimerobot",
        itemId: "mon_50",
        displayName: "worker.queue",
        state: "paused", severity: "ok",
        statusText: "Paused by operator",
        lastSeenAt: NOW - 60 * 60 * 18,
        elements: [
          { type: "text", rows: [
            { label: "Last status", value: "Operational" },
            { label: "Paused at",   value: "18h ago" },
          ]},
          { type: "events", items: [
            { t: NOW - 60*60*18, title: "Paused — release window", severity: "info" },
          ]},
        ],
      },

      // ── 9. maintenance window
      {
        instanceId: "i-bes", providerId: "beszel",
        itemId: "sys_build",
        displayName: "ci.builder",
        state: "maintenance", severity: "ok",
        statusText: "Scheduled maintenance",
        lastSeenAt: NOW - 60*32,
        elements: [
          { type: "text", rows: [
            { label: "Window",  value: "21:00 → 23:00 UTC" },
            { label: "Reason",  value: "Toolchain upgrade" },
            { label: "Ends in", value: "1h 12m" },
          ]},
        ],
      },

      // ── 10. backups — events + boolean
      {
        instanceId: "i-bes", providerId: "beszel",
        itemId: "sys_backup",
        displayName: "backups.nightly",
        state: "active", severity: "ok",
        statusText: "Last run succeeded",
        lastSeenAt: NOW - 60 * 60 * 6,
        elements: [
          { type: "boolean", key: "last", label: "Last backup", value: true, trueLabel: "Completed · 12.4 GB" },
          { type: "boolean", key: "off",  label: "Off-site replication", value: true, trueLabel: "Synced 5m ago" },
          { type: "events", items: [
            { t: NOW - 60*60*6,  title: "backup-nightly · 4m 12s",   severity: "info",  durationSec: 252 },
            { t: NOW - 60*60*30, title: "backup-nightly · 4m 8s",    severity: "info",  durationSec: 248 },
            { t: NOW - 60*60*54, title: "backup-nightly · 4m 20s",   severity: "info",  durationSec: 260 },
            { t: NOW - 60*60*78, title: "backup-nightly · skipped",  severity: "warn",  durationSec: 0 },
          ]},
        ],
      },

      // ── 11. network host — counters
      {
        instanceId: "i-bes", providerId: "beszel",
        itemId: "sys_edge",
        displayName: "edge.router",
        state: "active", severity: "ok",
        statusText: "Forwarding 1.4 Gbps",
        lastSeenAt: NOW - 6,
        elements: [
          { type: "counter", key: "rx", label: "Ingress", value: 842, unit: "Mb/s",
            history: { intervalSec: 60, values: series(40, 800, 250, 13) } },
          { type: "counter", key: "tx", label: "Egress", value: 612, unit: "Mb/s",
            history: { intervalSec: 60, values: series(40, 590, 200, 14) } },
          { type: "gauge", key: "cpu", label: "CPU", value: 34, unit: "%", max: 100 },
        ],
      },

      // ── 12. unknown / error fetching
      {
        instanceId: "i-ur", providerId: "uptimerobot",
        itemId: "mon_99",
        displayName: "legacy.api.v1",
        state: "unknown", severity: "ok",
        statusText: "Awaiting first check",
        lastSeenAt: NOW - 60,
        error: null,
        elements: [
          { type: "text", rows: [
            { label: "Type",     value: "HTTP" },
            { label: "Interval", value: "300s" },
          ]},
        ],
      },
    ],
  };
})();
