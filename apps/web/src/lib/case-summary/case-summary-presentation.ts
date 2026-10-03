import type { ProposedClaim, ProposedConflict } from "@hiveforyou/shared/canonical-study";
import type { CaseMap } from "@hiveforyou/shared/projections";

import type { ProvenanceIndex } from "@/lib/case/provenance-index";

export type CaseSummaryDecisionOption = {
  label: string;
  chip: string;
  claimId: string;
};

export type CaseSummaryDecision = {
  id: string;
  kind: string;
  question: string;
  context: string;
  slot: string;
  options: CaseSummaryDecisionOption[];
};

export type CaseSummaryChange = {
  id: string;
  slot: string;
  text: string;
  ask: string;
  fromClaimId?: string;
  toClaimId?: string;
};

export type CaseSummaryGap = {
  id: string;
  text: string;
  invite: string;
  lookedFor: string;
  closestClaimId?: string;
};

export type CaseSummaryCheckedRow = {
  text: string;
  claimIds: string[];
  youConfirmed: boolean;
  decisionId?: string;
  pickedClaimId?: string;
};

export type CaseSummaryModel = {
  domainLabel: string;
  documentCount: number;
  changesSectionTitle: string;
  decisions: CaseSummaryDecision[];
  changes: CaseSummaryChange[];
  gaps: CaseSummaryGap[];
  checkedPreview: CaseSummaryCheckedRow[];
  statusCounts: {
    needs: number;
    changed: number;
    missing: number;
    checked: number;
  };
};

const DOMAIN_LABELS: Record<string, string> = {
  iep: "Special Education / IEP",
  medicaid: "Medicaid",
  bankruptcy: "Bankruptcy",
};

function humanizeConstruct(construct: string): string {
  return construct
    .replace(/^hive_unmapped_construct_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatClaimValue(claim: ProposedClaim | undefined): string {
  if (!claim) {
    return "Unknown";
  }
  const statement = claim.statement?.trim();
  if (statement) {
    return statement;
  }
  return humanizeConstruct(claim.claimType ?? "claim");
}

function evidenceChip(ref: {
  sourceFilename?: string;
  logicalTitle?: string;
  physicalPageNumber?: number;
  page?: number;
}): string {
  const name = ref.sourceFilename ?? ref.logicalTitle ?? "Source";
  const page = ref.physicalPageNumber ?? ref.page;
  return page != null ? `${name} · p.${page}` : name;
}

function chipsForClaim(claimId: string, provenance: ProvenanceIndex | null): string[] {
  const refs = provenance?.byClaimId.get(claimId) ?? [];
  if (!refs.length) {
    return [];
  }
  return refs.slice(0, 3).map((ref) => evidenceChip(ref));
}

function changesTitle(domainId: string): string {
  if (domainId === "iep") {
    return "What changed since the last IEP";
  }
  return "What changed in your case";
}

function buildDecisions(
  map: CaseMap,
  conflicts: ProposedConflict[],
  claimsById: Map<string, ProposedClaim>,
  provenance: ProvenanceIndex | null,
): CaseSummaryDecision[] {
  const decisions: CaseSummaryDecision[] = [];

  for (const conflict of conflicts) {
    const sides = conflict.claimIds
      .map((id) => claimsById.get(id))
      .filter((claim): claim is ProposedClaim => Boolean(claim));
    if (sides.length < 2) {
      continue;
    }
    const construct =
      map.nodes.find((node) => node.conflictId === conflict.id)?.construct ??
      sides[0]?.claimType ??
      "this detail";
    const slot = humanizeConstruct(construct);
    decisions.push({
      id: conflict.id,
      kind: "Sources disagree",
      question:
        conflict.description.trim() ||
        `Which version should Hive use for ${slot}?`,
      context:
        map.attention.find((row) => row.conflictId === conflict.id)?.label ??
        "Validated sources describe this differently.",
      slot,
      options: sides.map((claim) => ({
        label: formatClaimValue(claim),
        chip: chipsForClaim(claim.id, provenance)[0] ?? "Source",
        claimId: claim.id,
      })),
    });
  }

  for (const item of map.attention) {
    if (item.kind !== "unresolved" || decisions.some((row) => row.id === item.id)) {
      continue;
    }
    const related = (item.claimIds ?? [])
      .map((id) => claimsById.get(id))
      .filter((claim): claim is ProposedClaim => Boolean(claim));
    if (related.length < 2) {
      continue;
    }
    decisions.push({
      id: item.id,
      kind: "Needs your read",
      question: item.label,
      context: "Hive needs your read before it compares or summarizes this further.",
      slot: item.label,
      options: related.slice(0, 2).map((claim) => ({
        label: formatClaimValue(claim),
        chip: chipsForClaim(claim.id, provenance)[0] ?? "Source",
        claimId: claim.id,
      })),
    });
  }

  return decisions;
}

function buildChanges(
  map: CaseMap,
  claimsById: Map<string, ProposedClaim>,
  provenance: ProvenanceIndex | null,
): CaseSummaryChange[] {
  return map.nodes
    .filter((node) => node.kind === "change")
    .map((node) => {
      const fromClaim = node.fromClaimId ? claimsById.get(node.fromClaimId) : undefined;
      const toClaim = node.toClaimId ? claimsById.get(node.toClaimId) : undefined;
      const fromText = formatClaimValue(fromClaim);
      const toText = formatClaimValue(toClaim);
      return {
        id: node.id,
        slot: humanizeConstruct(node.construct ?? node.label),
        text:
          node.summary?.trim() ||
          `${humanizeConstruct(node.construct ?? node.label)} changed from “${fromText}” to “${toText}”.`,
        ask: node.display?.meetingQuestion?.trim() || `What led to this change, and what data supports it?`,
        fromClaimId: node.fromClaimId,
        toClaimId: node.toClaimId,
      };
    });
}

function buildGaps(map: CaseMap): CaseSummaryGap[] {
  return map.nodes
    .filter((node) => node.kind === "ghost")
    .map((node) => {
      const attention = map.attention.find((row) => row.nodeId === node.id);
      return {
        id: node.id,
        text: node.label,
        invite:
          node.summary?.trim() ||
          "Adding the missing document would help Hive complete this part of the picture.",
        lookedFor: node.label,
        closestClaimId: attention?.claimIds?.[0],
      };
    });
}

function buildCheckedPreview(
  map: CaseMap,
  openClaimIds: Set<string>,
  claimsById: Map<string, ProposedClaim>,
  provenance: ProvenanceIndex | null,
  limit = 6,
): CaseSummaryCheckedRow[] {
  const rows: CaseSummaryCheckedRow[] = [];
  for (const node of map.nodes) {
    if (node.kind !== "fact" && node.kind !== "decision") {
      continue;
    }
    if (node.claimIds?.some((id) => openClaimIds.has(id))) {
      continue;
    }
    if (node.disclosureLevel === "prominent") {
      continue;
    }
    const claimIds = node.claimIds ?? [];
    const claim = claimIds[0] ? claimsById.get(claimIds[0]) : undefined;
    rows.push({
      text: node.summary?.trim() || formatClaimValue(claim) || node.label,
      claimIds,
      youConfirmed: false,
    });
    if (rows.length >= limit) {
      break;
    }
  }
  return rows;
}

function countChecked(map: CaseMap, openClaimIds: Set<string>): number {
  return map.nodes.filter((node) => {
    if (node.kind !== "fact" && node.kind !== "decision") {
      return false;
    }
    if (node.claimIds?.some((id) => openClaimIds.has(id))) {
      return false;
    }
    return true;
  }).length;
}

export function buildCaseSummaryModel(input: {
  caseMap: CaseMap;
  conflicts: ProposedConflict[];
  claimsById: Map<string, ProposedClaim>;
  provenance: ProvenanceIndex | null;
  documentCount: number;
}): CaseSummaryModel {
  const { caseMap, conflicts, claimsById, provenance, documentCount } = input;
  const decisions = buildDecisions(caseMap, conflicts, claimsById, provenance);
  const openClaimIds = new Set(
    decisions.flatMap((decision) => decision.options.map((option) => option.claimId)),
  );
  const changes = buildChanges(caseMap, claimsById, provenance);
  const gaps = buildGaps(caseMap);
  const checked = countChecked(caseMap, openClaimIds);

  return {
    domainLabel: DOMAIN_LABELS[caseMap.domainId] ?? humanizeConstruct(caseMap.domainId),
    documentCount,
    changesSectionTitle: changesTitle(caseMap.domainId),
    decisions,
    changes,
    gaps,
    checkedPreview: buildCheckedPreview(caseMap, openClaimIds, claimsById, provenance),
    statusCounts: {
      needs: decisions.length,
      changed: changes.length,
      missing: gaps.length,
      checked,
    },
  };
}

export function headlineForOpenNeeds(openCount: number): string {
  if (openCount === 0) {
    return "Your case is ready for the meeting.";
  }
  if (openCount === 1) {
    return "One thing needs you. The rest is checked.";
  }
  return `${openCount} things need you. The rest is checked.`;
}

export function adjustCountsForAnswers(
  counts: CaseSummaryModel["statusCounts"],
  answeredCount: number,
  attestedCount: number,
): CaseSummaryModel["statusCounts"] {
  return {
    needs: Math.max(0, counts.needs - answeredCount),
    changed: counts.changed,
    missing: counts.missing,
    checked: counts.checked + attestedCount,
  };
}

export function attestedCheckedRows(
  decisions: CaseSummaryDecision[],
  answers: Record<string, string>,
): CaseSummaryCheckedRow[] {
  return decisions
    .filter((decision) => answers[decision.id] && answers[decision.id] !== "__unsure")
    .map((decision) => {
      const answerLabel = answers[decision.id];
      const picked = decision.options.find((option) => option.label === answerLabel);
      return {
        text: `${decision.slot}: ${answerLabel}`,
        claimIds: picked ? [picked.claimId] : [],
        youConfirmed: true,
        decisionId: decision.id,
        pickedClaimId: picked?.claimId,
      };
    });
}

export function meetingQuestionsFromAnswers(
  decisions: CaseSummaryDecision[],
  answers: Record<string, string>,
): string[] {
  return decisions
    .filter((decision) => answers[decision.id] === "__unsure")
    .map((decision) => decision.question);
}
