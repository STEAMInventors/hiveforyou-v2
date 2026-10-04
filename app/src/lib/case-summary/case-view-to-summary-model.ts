import type { CaseView, ChangeItem, ConflictItem, FactItem } from "@hiveforyou/shared/projections";

import type { CaseSummaryModel } from "./case-summary-presentation";

const DOMAIN_LABELS: Record<string, string> = {
  iep: "Special Education / IEP",
  medicaid: "Medicaid",
  bankruptcy: "Bankruptcy",
};

function changesTitle(domainPackId: string): string {
  if (domainPackId.includes("iep")) {
    return "What changed since the last IEP";
  }
  return "What changed in your case";
}

function chipLabel(chip: { fileName: string; page: number }): string {
  return `${chip.fileName} · p.${chip.page}`;
}

export function caseViewToSummaryModel(caseView: CaseView): CaseSummaryModel {
  const itemsById = new Map(caseView.items.map((item) => [item.itemId, item]));

  const decisions = caseView.layout.needsDecision.inFocus
    .concat(caseView.layout.needsDecision.outOfFocus)
    .map((itemId) => itemsById.get(itemId))
    .filter((item): item is ConflictItem => item?.state === "conflicting")
    .map((item) => ({
      id: item.itemId,
      kind: "Sources disagree",
      question: `Which version should Hive use for ${item.label}?`,
      context: "Validated sources describe this differently.",
      slot: item.label,
      options: item.sides.map((side) => ({
        label: side.value.display,
        chip: side.chips[0] ? chipLabel(side.chips[0]) : "Source",
        claimId: side.claimId,
      })),
    }));

  const changes = caseView.layout.changed
    .map((id) => itemsById.get(id))
    .filter((item): item is ChangeItem => item?.state === "changed")
    .map((item) => {
      const first = item.series[0];
      const last = item.series[item.series.length - 1];
      return {
        id: item.itemId,
        slot: item.label,
        text:
          first && last
            ? `${item.label} changed from “${first.value.display}” to “${last.value.display}”.`
            : item.label,
        ask: "What led to this change, and what data supports it?",
        fromClaimId: first?.claimId,
        toClaimId: last?.claimId,
      };
    });

  const gaps = caseView.layout.gaps
    .map((id) => itemsById.get(id))
    .filter(Boolean)
    .map((item) => ({
      id: item!.itemId,
      text: item!.label,
      invite: "Adding the missing document would help Hive complete this part of the picture.",
      lookedFor: item!.label,
    }));

  const summaryFromClient = caseView.clientSummary.items[0];
  if (summaryFromClient && decisions.length === 0 && changes.length > 0) {
    // Prefer model-written client summary lines when code sections are sparse.
    changes[0] = {
      ...changes[0]!,
      text: summaryFromClient.text,
      ask: summaryFromClient.worthAsking,
    };
  }

  const openClaimIds = new Set(
    decisions.flatMap((decision) => decision.options.map((option) => option.claimId)),
  );

  const checkedPreview = caseView.layout.facts
    .flatMap((group) => group.itemIds)
    .map((id) => itemsById.get(id))
    .filter((item): item is FactItem => item?.state === "established")
    .slice(0, 6)
    .map((item) => ({
      text: item.label,
      claimIds: [item.claimId],
      youConfirmed: false,
    }));

  const checked =
    caseView.counts.established -
    caseView.items.filter(
      (item): item is FactItem =>
        item.state === "established" && openClaimIds.has(item.claimId),
    ).length;

  return {
    domainLabel:
      DOMAIN_LABELS[caseView.domainPack?.packId.replace(/^hive\.domain\./, "") ?? ""] ??
      caseView.intent.label,
    documentCount: caseView.documents.length,
    changesSectionTitle: changesTitle(caseView.domainPack?.packId ?? ""),
    decisions,
    changes,
    gaps,
    checkedPreview,
    statusCounts: {
      needs: caseView.counts.needsDecision,
      changed: caseView.counts.changed,
      missing: caseView.counts.gaps,
      checked: Math.max(checked, 0),
    },
  };
}
