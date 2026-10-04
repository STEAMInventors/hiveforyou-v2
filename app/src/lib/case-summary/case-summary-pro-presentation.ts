import type { ProposedClaim } from "@hiveforyou/shared/canonical-study";
import type { CaseMap } from "@hiveforyou/shared/projections";

import type { ProvenanceIndex } from "@/lib/case/provenance-index";
import { primaryRefForClaim } from "@/lib/case-summary/case-summary-evidence";

import type {
  CaseSummaryChange,
  CaseSummaryCheckedRow,
  CaseSummaryDecision,
  CaseSummaryGap,
  CaseSummaryModel,
} from "./case-summary-presentation";

export type ProFactState =
  | "CONFLICT"
  | "AMBIGUOUS"
  | "GAP"
  | "CHANGED"
  | "RESOLVED"
  | "ATTESTED";

export const PRO_STATE_LABEL: Record<ProFactState, string> = {
  CONFLICT: "Conflict",
  AMBIGUOUS: "Needs read",
  CHANGED: "Changed",
  GAP: "Gap",
  RESOLVED: "Resolved",
  ATTESTED: "Attested",
};

export const PRO_STATE_ORDER: ProFactState[] = [
  "CONFLICT",
  "AMBIGUOUS",
  "GAP",
  "CHANGED",
  "ATTESTED",
  "RESOLVED",
];

export type ProFactRow = {
  id: string;
  slot: string;
  area: string;
  state: ProFactState;
  val: string;
  cons: number;
  note?: string;
  claimIds?: string[];
  fromClaimId?: string;
  toClaimId?: string;
  gap?: CaseSummaryGap;
  decisionId?: string;
};

export type ProTimelineEntry = {
  date: string;
  label: string;
  claimId: string;
  flagged?: boolean;
};

export type ProDocumentCoverageRow = {
  label: string;
  filename: string;
  pages: number[];
  factCount: number;
};

function humanizeConstruct(construct: string): string {
  return construct
    .replace(/^hive_unmapped_construct_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function areaForClaim(caseMap: CaseMap, claimId: string): string {
  const node = caseMap.nodes.find((row) => row.claimIds?.includes(claimId));
  if (node?.zoneId) {
    const zone = caseMap.nodes.find((z) => z.kind === "zone" && z.zoneId === node.zoneId);
    if (zone?.label) {
      return zone.label;
    }
  }
  if (node?.construct) {
    return humanizeConstruct(node.construct);
  }
  return "Case";
}

function formatClaimValue(claim: ProposedClaim | undefined): string {
  if (!claim) {
    return "—";
  }
  return claim.statement?.trim() || humanizeConstruct(claim.claimType ?? "claim");
}

function compactClaimValue(claim: ProposedClaim | undefined, maxLen = 48): string {
  const full = formatClaimValue(claim);
  if (full.length <= maxLen) {
    return full;
  }
  return `${full.slice(0, maxLen - 1).trim()}…`;
}

function compactChangeValue(
  fromClaim: ProposedClaim | undefined,
  toClaim: ProposedClaim | undefined,
): string {
  const from = compactClaimValue(fromClaim);
  const to = compactClaimValue(toClaim);
  if (from === "—" && to === "—") {
    return "—";
  }
  return `${from} → ${to}`;
}

function proGapSlot(gap: CaseSummaryGap): string {
  const fromLookedFor = gap.lookedFor.replace(/^a\s+/i, "").replace(/^an\s+/i, "");
  if (fromLookedFor.length > 0 && fromLookedFor.length <= 80) {
    return fromLookedFor.charAt(0).toUpperCase() + fromLookedFor.slice(1);
  }
  return gap.text.replace(/\.$/, "");
}

function proGapValue(gap: CaseSummaryGap): string {
  const lower = gap.text.toLowerCase();
  if (lower.includes("consent") || lower.includes("signature")) {
    return "signature blank";
  }
  if (lower.includes("progress report")) {
    return "none found";
  }
  return "none found";
}

function proCheckedSlot(text: string): string {
  const match = text.match(/^(.+?)\s+(matches|is unchanged|is the same)/i);
  return match?.[1]?.trim() ?? text;
}

function humanizeFilename(filename: string): string {
  const base = filename
    .replace(/\.pdf$/i, "")
    .replace(/^\d+[_-]*/, "")
    .replace(/_/g, " ")
    .trim();
  if (!base) {
    return filename;
  }
  return base.replace(/\b\w/g, (char) => char.toUpperCase());
}

function logicalTitleForDocument(
  provenance: ProvenanceIndex | null,
  sourceDocumentId: string,
  filename: string,
): string | undefined {
  if (!provenance) {
    return undefined;
  }
  for (const refs of provenance.byClaimId.values()) {
    for (const ref of refs) {
      if (
        ref.sourceDocumentId === sourceDocumentId ||
        ref.sourceFilename?.trim() === filename
      ) {
        const title = ref.logicalTitle?.trim();
        if (title) {
          return title;
        }
      }
    }
  }
  return undefined;
}

function claimSummaryValues(claimIds: string[], claimsById: Map<string, ProposedClaim>): string {
  return claimIds
    .map((id) => compactClaimValue(claimsById.get(id)))
    .filter(Boolean)
    .join("  vs  ");
}

export function buildProFactRows(input: {
  summary: CaseSummaryModel;
  answers: Record<string, string>;
  claimsById: Map<string, ProposedClaim>;
  caseMap: CaseMap;
}): ProFactRow[] {
  const { summary, answers, claimsById, caseMap } = input;
  const rows: ProFactRow[] = [];

  for (const decision of summary.decisions) {
    const answer = answers[decision.id];
    const area = areaForClaim(caseMap, decision.options[0]?.claimId ?? "");
    if (answer && answer !== "__unsure") {
      rows.push({
        id: decision.id,
        slot: decision.slot,
        area,
        state: "ATTESTED",
        val: answer,
        cons: 3,
        note: "Parent chose between conflicting sources",
        claimIds: decision.options.map((o) => o.claimId),
        decisionId: decision.id,
      });
      continue;
    }
    rows.push({
      id: decision.id,
      slot: decision.slot,
      area,
      state: decision.kind === "Needs your read" ? "AMBIGUOUS" : "CONFLICT",
      val: claimSummaryValues(
        decision.options.map((o) => o.claimId),
        claimsById,
      ),
      cons: 3,
      note:
        answer === "__unsure"
          ? "Parent added this to meeting questions"
          : "Awaiting parent",
      claimIds: decision.options.map((o) => o.claimId),
      decisionId: decision.id,
    });
  }

  for (const change of summary.changes) {
    const fromClaim = change.fromClaimId ? claimsById.get(change.fromClaimId) : undefined;
    const toClaim = change.toClaimId ? claimsById.get(change.toClaimId) : undefined;
    rows.push({
      id: change.id,
      slot: change.slot,
      area: areaForClaim(caseMap, change.fromClaimId ?? change.toClaimId ?? ""),
      state: "CHANGED",
      val: compactChangeValue(fromClaim, toClaim),
      cons: 2,
      fromClaimId: change.fromClaimId,
      toClaimId: change.toClaimId,
    });
  }

  for (const gap of summary.gaps) {
    rows.push({
      id: gap.id,
      slot: proGapSlot(gap),
      area: "Records",
      state: "GAP",
      val: proGapValue(gap),
      cons: 2,
      gap,
      claimIds: gap.closestClaimId ? [gap.closestClaimId] : [],
    });
  }

  for (const row of summary.checkedPreview) {
    rows.push({
      id: `checked-${row.text}`,
      slot: proCheckedSlot(row.text),
      area: areaForClaim(caseMap, row.claimIds[0] ?? ""),
      state: "RESOLVED",
      val: formatClaimValue(row.claimIds[0] ? claimsById.get(row.claimIds[0]) : undefined),
      cons: 1,
      claimIds: row.claimIds,
    });
  }

  return rows.sort((a, b) => {
    const order = PRO_STATE_ORDER.indexOf(a.state) - PRO_STATE_ORDER.indexOf(b.state);
    if (order !== 0) {
      return order;
    }
    return b.cons - a.cons;
  });
}

export function countProStates(
  rows: ProFactRow[],
  hiddenResolved: number,
): Record<ProFactState, number> {
  const counts: Record<ProFactState, number> = {
    CONFLICT: 0,
    AMBIGUOUS: 0,
    GAP: 0,
    CHANGED: 0,
    ATTESTED: 0,
    RESOLVED: 0,
  };
  for (const row of rows) {
    counts[row.state] += 1;
  }
  counts.RESOLVED += hiddenResolved;
  return counts;
}

export function hiddenResolvedCount(summary: CaseSummaryModel, attestedCount: number): number {
  return Math.max(0, summary.statusCounts.checked - summary.checkedPreview.length - attestedCount);
}

export function buildProTimeline(caseMap: CaseMap): ProTimelineEntry[] {
  return caseMap.chronology.map((entry) => ({
    date: entry.occurredOn ?? "—",
    label: entry.label,
    claimId: entry.claimId,
    flagged: Boolean(entry.claimId && caseMap.attention.some((a) => a.claimIds?.includes(entry.claimId))),
  }));
}

export function buildDocumentCoverage(
  provenance: ProvenanceIndex | null,
  sourceDocuments: Array<{ originalFilename?: string | null; sourceDocumentId: string }>,
): ProDocumentCoverageRow[] {
  const pagesByFile = new Map<string, Set<number>>();
  const factsByFile = new Map<string, number>();

  if (provenance) {
    for (const refs of provenance.byClaimId.values()) {
      for (const ref of refs) {
        const file = ref.sourceFilename?.trim() || ref.sourceDocumentId;
        const page = ref.physicalPageNumber ?? ref.page;
        if (page != null) {
          const set = pagesByFile.get(file) ?? new Set<number>();
          set.add(page);
          pagesByFile.set(file, set);
        }
        factsByFile.set(file, (factsByFile.get(file) ?? 0) + 1);
      }
    }
  }

  return sourceDocuments.map((doc) => {
    const filename = doc.originalFilename?.trim() || doc.sourceDocumentId;
    const label =
      logicalTitleForDocument(provenance, doc.sourceDocumentId, filename) ??
      humanizeFilename(filename);
    const pages = [...(pagesByFile.get(filename) ?? pagesByFile.get(doc.sourceDocumentId) ?? [])].sort(
      (a, b) => a - b,
    );
    return {
      label,
      filename,
      pages,
      factCount: factsByFile.get(filename) ?? factsByFile.get(doc.sourceDocumentId) ?? 0,
    };
  });
}

export function buildProExportPayload(input: {
  domainLabel: string;
  studiedAt: string;
  rows: ProFactRow[];
  provenance: ProvenanceIndex | null;
}) {
  return {
    domain: input.domainLabel,
    studied: input.studiedAt,
    facts: input.rows.map((row) => ({
      fact: row.slot,
      area: row.area,
      state: row.state,
      value: row.val,
      weight: row.cons,
      note: row.note ?? "",
      sources: (row.fromClaimId && row.toClaimId
        ? [row.fromClaimId, row.toClaimId]
        : row.claimIds ?? []
      ).flatMap((claimId) => {
        const ref = primaryRefForClaim(input.provenance, claimId);
        if (!ref) {
          return [];
        }
        return [
          {
            document: ref.sourceFilename ?? ref.sourceDocumentId,
            page: ref.physicalPageNumber ?? ref.page ?? null,
            quote: ref.canonicalTextSnippet ?? null,
          },
        ];
      }),
    })),
  };
}

export function downloadTextFile(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(anchor.href);
    anchor.remove();
  }, 0);
}
