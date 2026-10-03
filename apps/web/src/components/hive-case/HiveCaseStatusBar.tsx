import type { CaseHeader } from "@hiveforyou/shared/projections";

export function HiveCaseStatusBar({ header }: { header: CaseHeader }) {
  const c = header.statusCounts;
  const segments: Array<{ flex: number; color: string; label: string; count: number }> = [
    { flex: c.worthAsking, color: "#4285F4", label: "worth asking", count: c.worthAsking },
    { flex: c.changed, color: "#F9AB00", label: "changed", count: c.changed },
    { flex: c.missing, color: "#EA4335", label: "missing", count: c.missing },
    { flex: c.looksClear, color: "#34A853", label: "look clear", count: c.looksClear },
  ].filter((s) => s.count > 0);

  const total = segments.reduce((n, s) => n + s.flex, 0) || 1;

  return (
    <>
      <div
        style={{ display: "flex", gap: 4, height: 6 }}
        aria-hidden="true"
        data-testid="case-summary-status-bar"
      >
        {segments.map((s) => (
          <div
            key={s.label}
            style={{
              flex: `${s.flex} 1 0`,
              background: s.color,
              borderRadius: 3,
              minWidth: s.flex > 0 ? 4 : 0,
            }}
          />
        ))}
        {segments.length === 0 ? (
          <div style={{ flex: 1, background: "#E8EAED", borderRadius: 3 }} />
        ) : null}
      </div>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 14 }}
        data-testid="case-summary-legend"
      >
        {segments.map((s) => (
          <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
            {s.count} {s.label}
          </span>
        ))}
        {total === 1 && segments.length === 0 ? (
          <span style={{ color: "#5F6368" }}>Studying complete</span>
        ) : null}
      </div>
    </>
  );
}
