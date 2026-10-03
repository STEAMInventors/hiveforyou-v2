import type { CardStatus, CaseViewV2 } from "@hiveforyou/shared/projections";

const STATUS_LABELS: Record<CardStatus, string> = {
  worth_a_question: "Worth a question",
  changed: "Changed",
  looks_clear: "Looks clear",
  reference: "Reference",
  two_versions: "Two versions",
  not_in_your_documents: "Not in your documents",
};

/** Plain-text snapshot of the client-facing case view (for golden tests). */
export function renderCaseViewV2ClientText(view: CaseViewV2): string {
  const lines: string[] = [];
  if (view.header.currentPlanLabel?.trim()) {
    lines.push(view.header.currentPlanLabel.trim());
  }
  if (view.header.askedText?.trim()) {
    lines.push(`You asked: ${view.header.askedText.trim()}.`);
  }
  const c = view.header.statusCounts;
  lines.push(
    `${c.worthAsking} worth asking · ${c.changed} changed · ${c.missing} missing · ${c.looksClear} look clear`,
  );
  for (const story of view.story) {
    if (story.slotType === "top_question" || story.slotType === "echo") {
      continue;
    }
    if (story.slotType === "not_found") {
      continue;
    }
    lines.push(story.text);
  }
  const top = view.story.find((s) => s.slotType === "top_question");
  if (top) {
    lines.push(top.text);
  }
  const cardLine = view.plan.cards
    .map((card) => {
      const label = STATUS_LABELS[card.status];
      return label && card.status !== "reference" ? `${card.title} [${label}]` : card.title;
    })
    .join(" · ");
  lines.push(`Cards: ${cardLine}`);
  return `${lines.join("\n")}\n`;
}
