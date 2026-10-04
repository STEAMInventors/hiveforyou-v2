import type { CardStatus } from "@hiveforyou/shared/projections";
import { IEP_DOMAIN_VIEW } from "@hiveforyou/shared/projections";

const statusColors: Record<CardStatus, { dot: string; text: string }> = {
  two_versions: { dot: "#EA4335", text: "#C5221F" },
  worth_a_question: { dot: "#4285F4", text: "#1967D2" },
  changed: { dot: "#F9AB00", text: "#B06000" },
  not_in_your_documents: { dot: "#EA4335", text: "#C5221F" },
  looks_clear: { dot: "#34A853", text: "#188038" },
  reference: { dot: "#9AA0A6", text: "#5F6368" },
};

export function HiveCaseStatusBadge({ status }: { status: CardStatus }) {
  const label = IEP_DOMAIN_VIEW.statusWords[status];
  if (!label) {
    return null;
  }
  const colors = statusColors[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        fontWeight: 600,
        color: colors.text,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors.dot }} />
      {label}
    </span>
  );
}
