import type { ProposedClaim } from "@hiveforyou/shared/canonical-study";
import type { CaseMap, CaseMapNode } from "@hiveforyou/shared/projections";

import type { ProvenanceIndex } from "@/lib/case/provenance-index";
import { primaryRefForClaim } from "@/lib/case-summary/case-summary-evidence";

import type { CaseSummaryGap, CaseSummaryModel } from "./case-summary-presentation";

export const PRO_COMPARE_STATE_LABEL: Record<ProCompareState, string> = {
  changed: "Changed",
  added: "Added",
  retired: "Retired",
  dropped: "Dropped",
  reconfirmed: "Reconfirmed",
  notcompared: "Not compared",
  scheduled: "Scheduled",
  gap: "Gap",
};

export type ProCompareState =
  | "changed"
  | "added"
  | "retired"
  | "dropped"
  | "reconfirmed"
  | "notcompared"
  | "scheduled"
  | "gap";

export type ProTypedFact = {
  id: string;
  claimId: string;
  attr: string;
  val: string;
  unit?: string;
  ctx?: string;
  asOf?: string;
  sourceDocumentId: string;
  docRole: string;
  filename: string;
  page: number;
};

export type ProDocMeta = {
  id: string;
  role: string;
  file: string;
  date: string | null;
};

export type ProCompareRow =
  | { kind: "group"; label: string }
  | {
      kind: "row";
      label: string;
      priorClaimIds?: string[];
      propClaimIds?: string[];
      state: ProCompareState;
      why?: string;
    };

export type ProReviewSignal = {
  state: ProCompareState;
  headline: string;
  detail: string;
  claimIds: string[];
  searched?: boolean;
  gap?: CaseSummaryGap;
  question: string;
};

export type ProLivingModel = {
  studentLabel: string;
  caseTypeLabel: string;
  asOfDate: string | null;
  recordStart: string | null;
  eligibilityHint: string;
  schoolHint: string;
  documentCount: number;
  facts: ProTypedFact[];
  factsByClaimId: Map<string, ProTypedFact>;
  docs: ProDocMeta[];
  compareRows: ProCompareRow[];
  signals: ProReviewSignal[];
  fluencySeries: ProTypedFact[];
  fluencyGoal?: ProTypedFact;
  reevalFacts: ProTypedFact[];
  fluencyMeasureWarning?: string;
  timeline: Array<{ docId: string; date: string | null; undated?: boolean }>;
  timelineHoles: Array<{ months: number; fromLabel: string; toLabel: string }>;
  integrity: Array<{
    docId: string;
    pages: number[];
    factCount: number;
    flagHtml: "ok" | "undated" | "empty" | "partial";
    flagText: string;
  }>;
};

function humanizeConstruct(construct: string): string {
  return construct
    .replace(/^hive_unmapped_construct_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function attrLabel(claim: ProposedClaim): string {
  return humanizeConstruct(claim.claimType ?? "Fact");
}

function formatVal(claim: ProposedClaim): { val: string; unit?: string } {
  if (claim.measurement) {
    return {
      val: String(claim.measurement.value),
      unit: claim.measurement.unit,
    };
  }
  const statement = claim.statement?.trim();
  if (statement && statement.length <= 80) {
    return { val: statement };
  }
  if (statement) {
    return { val: `${statement.slice(0, 77)}…` };
  }
  return { val: attrLabel(claim) };
}

function docRoleFromRef(
  sourceDocumentId: string,
  filename: string,
  provenance: ProvenanceIndex | null,
): string {
  if (provenance) {
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
  }
  return filename
    .replace(/\.pdf$/i, "")
    .replace(/^\d+[_-]*/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildFacts(
  claims: ProposedClaim[],
  provenance: ProvenanceIndex | null,
  sourceDocs: Array<{ sourceDocumentId: string; originalFilename: string }>,
): { facts: ProTypedFact[]; docs: ProDocMeta[] } {
  const filenameById = new Map(
    sourceDocs.map((d) => [d.sourceDocumentId, d.originalFilename?.trim() || d.sourceDocumentId]),
  );
  const docDates = new Map<string, string | null>();

  const facts: ProTypedFact[] = [];
  for (const claim of claims) {
    const ref = primaryRefForClaim(provenance, claim.id) ?? claim.evidenceRefs[0];
    if (!ref) {
      continue;
    }
    const sourceDocumentId = ref.sourceDocumentId;
    const filename = ref.sourceFilename?.trim() || filenameById.get(sourceDocumentId) || sourceDocumentId;
    const { val, unit } = formatVal(claim);
    const asOf = claim.measurement?.asOf ?? claim.temporalKind;
    if (claim.measurement?.asOf) {
      docDates.set(sourceDocumentId, claim.measurement.asOf);
    }
    facts.push({
      id: claim.id,
      claimId: claim.id,
      attr: attrLabel(claim),
      val,
      unit,
      ctx: claim.objectiveRelevance?.relatedObjectiveEcho,
      asOf: typeof asOf === "string" ? asOf : undefined,
      sourceDocumentId,
      docRole: docRoleFromRef(sourceDocumentId, filename, provenance),
      filename,
      page: ref.physicalPageNumber ?? ref.page ?? 1,
    });
  }

  const docs: ProDocMeta[] = sourceDocs.map((doc) => {
    const file = doc.originalFilename?.trim() || doc.sourceDocumentId;
    return {
      id: doc.sourceDocumentId,
      role: docRoleFromRef(doc.sourceDocumentId, file, provenance),
      file,
      date: docDates.get(doc.sourceDocumentId) ?? null,
    };
  });

  return { facts, docs };
}

function zoneLabel(caseMap: CaseMap, node: CaseMapNode): string {
  if (node.zoneId) {
    const zone = caseMap.nodes.find((z) => z.kind === "zone" && z.zoneId === node.zoneId);
    if (zone?.label) {
      return zone.label;
    }
  }
  return "Case";
}

export function buildCompareRows(caseMap: CaseMap): ProCompareRow[] {
  const rows: ProCompareRow[] = [];
  let lastGroup: string | null = null;

  for (const node of caseMap.nodes.filter((n) => n.kind === "change")) {
    const group = zoneLabel(caseMap, node);
    if (group !== lastGroup) {
      rows.push({ kind: "group", label: group });
      lastGroup = group;
    }
    const label = humanizeConstruct(node.construct ?? node.label);
    const hasPrior = Boolean(node.fromClaimId);
    const hasProp = Boolean(node.toClaimId);
    let state: ProCompareState = "changed";
    if (hasPrior && !hasProp) {
      state = "retired";
    } else if (!hasPrior && hasProp) {
      state = "added";
    }
    rows.push({
      kind: "row",
      label,
      priorClaimIds: node.fromClaimId ? [node.fromClaimId] : undefined,
      propClaimIds: node.toClaimId ? [node.toClaimId] : undefined,
      state,
      why: node.summary?.trim(),
    });
  }

  if (rows.length === 0) {
    rows.push({ kind: "group", label: "Case" });
    for (const item of caseMap.attention.filter((a) => a.kind === "conflict")) {
      rows.push({
        kind: "row",
        label: item.label,
        priorClaimIds: item.claimIds?.slice(0, 1),
        propClaimIds: item.claimIds?.slice(1, 2),
        state: "changed",
        why: "Conflicting validated sources",
      });
    }
  }

  return rows;
}

function buildSignals(summary: CaseSummaryModel, caseMap: CaseMap): ProReviewSignal[] {
  const signals: ProReviewSignal[] = [];

  for (const change of summary.changes.slice(0, 2)) {
    const claimIds = [change.fromClaimId, change.toClaimId].filter(Boolean) as string[];
    signals.push({
      state: change.fromClaimId && !change.toClaimId ? "retired" : "changed",
      headline: change.text,
      detail: change.ask,
      claimIds,
      question: change.ask,
    });
  }

  for (const gap of summary.gaps.slice(0, 1)) {
    signals.push({
      state: "gap",
      headline: gap.text,
      detail: gap.invite,
      claimIds: gap.closestClaimId ? [gap.closestClaimId] : [],
      searched: true,
      gap,
      question: gap.invite,
    });
  }

  for (const item of caseMap.attention) {
    if (signals.length >= 3) {
      break;
    }
    if (item.kind === "conflict" && !signals.some((s) => s.headline === item.label)) {
      signals.push({
        state: "changed",
        headline: item.label,
        detail: "Validated sources describe this differently.",
        claimIds: item.claimIds ?? [],
        question: `Which source should Hive treat as authoritative for ${item.label}?`,
      });
    }
  }

  return signals.slice(0, 3);
}

export function pickFluencyFacts(facts: ProTypedFact[]): ProTypedFact[] {
  return facts
    .filter((f) => {
      const hay = `${f.attr} ${f.val} ${f.unit ?? ""}`.toLowerCase();
      return hay.includes("fluency") || hay.includes("wcpm") || hay.includes("oral reading");
    })
    .sort((a, b) => (a.asOf ?? "").localeCompare(b.asOf ?? ""));
}

export function pickGoalTarget(facts: ProTypedFact[]): ProTypedFact | undefined {
  return facts.find((f) => {
    const hay = `${f.attr} ${f.val}`.toLowerCase();
    return hay.includes("goal") && (hay.includes("target") || f.unit === "WCPM");
  });
}

export function pickReevalFacts(facts: ProTypedFact[], fluencyIds: Set<string>): ProTypedFact[] {
  return facts.filter((f) => !fluencyIds.has(f.id)).slice(0, 6);
}

function monthGapLabel(from: string, to: string): { months: number; fromLabel: string; toLabel: string } {
  const gapM = (Date.parse(to) - Date.parse(from)) / 2.628e9;
  return {
    months: Math.round(gapM),
    fromLabel: from,
    toLabel: to,
  };
}

function buildTimeline(docs: ProDocMeta[]): {
  timeline: ProLivingModel["timeline"];
  holes: ProLivingModel["timelineHoles"];
} {
  const dated = docs.filter((d) => d.date).sort((a, b) => a.date!.localeCompare(b.date!));
  const undated = docs.filter((d) => !d.date);
  const timeline: ProLivingModel["timeline"] = dated.map((d) => ({
    docId: d.id,
    date: d.date,
  }));
  for (const d of undated) {
    timeline.push({ docId: d.id, date: null, undated: true });
  }

  const holes: ProLivingModel["timelineHoles"] = [];
  for (let i = 1; i < dated.length; i++) {
    const prev = dated[i - 1]!;
    const cur = dated[i]!;
    const gap = monthGapLabel(prev.date!, cur.date!);
    if (gap.months > 13) {
      holes.push(gap);
    }
  }

  return { timeline, holes };
}

export function buildIntegrity(
  docs: ProDocMeta[],
  facts: ProTypedFact[],
  provenance: ProvenanceIndex | null,
): ProLivingModel["integrity"] {
  const byDoc = new Map<string, { pages: Set<number>; count: number }>();
  for (const fact of facts) {
    const row = byDoc.get(fact.sourceDocumentId) ?? { pages: new Set<number>(), count: 0 };
    row.pages.add(fact.page);
    row.count += 1;
    byDoc.set(fact.sourceDocumentId, row);
  }

  return docs.map((doc) => {
    const used = byDoc.get(doc.id);
    let flagHtml: ProLivingModel["integrity"][number]["flagHtml"] = "ok";
    let flagText = "OK";
    if (!used) {
      flagHtml = "empty";
      flagText = "No facts read — check this file";
    } else if (!doc.date) {
      flagHtml = "undated";
      flagText = "Undated";
    } else if (provenance && used.count < 2) {
      flagHtml = "partial";
      flagText = "Partial capture — review source";
    }
    return {
      docId: doc.id,
      pages: [...(used?.pages ?? [])].sort((a, b) => a - b),
      factCount: used?.count ?? 0,
      flagHtml,
      flagText,
    };
  });
}

function studentLabelFromEntities(entities: Array<{ label: string; entityType: string }>): string {
  const student = entities.find(
    (e) => e.entityType.toLowerCase().includes("student") || e.entityType.toLowerCase().includes("person"),
  );
  return student?.label?.trim() || "Your case";
}

export function buildProLivingModel(input: {
  caseMap: CaseMap;
  summary: CaseSummaryModel;
  claims: ProposedClaim[];
  provenance: ProvenanceIndex | null;
  sourceDocuments: Array<{ sourceDocumentId: string; originalFilename: string }>;
  entities?: Array<{ label: string; entityType: string }>;
  studiedAt?: string | null;
}): ProLivingModel {
  const { facts, docs } = buildFacts(input.claims, input.provenance, input.sourceDocuments);
  const factsByClaimId = new Map(facts.map((f) => [f.claimId, f]));
  const fluencySeries = pickFluencyFacts(facts);
  const fluencyGoal = pickGoalTarget(facts);
  const fluencyIds = new Set(fluencySeries.map((f) => f.id));
  const { timeline, holes } = buildTimeline(docs);

  const eligibility = facts.find((f) => f.attr.toLowerCase().includes("eligibility"));
  const school = facts.find((f) => f.attr.toLowerCase().includes("school"));

  const datedFacts = facts.filter((f) => f.asOf && /^\d{4}-\d{2}/.test(f.asOf));
  const recordStart =
    datedFacts.length > 0
      ? datedFacts.map((f) => f.asOf!).sort()[0]!
      : docs.find((d) => d.date)?.date ?? null;

  return {
    studentLabel: studentLabelFromEntities(input.entities ?? []),
    caseTypeLabel: input.summary.domainLabel.includes("IEP") ? "Reevaluation" : input.summary.domainLabel,
    asOfDate: input.studiedAt ?? docs.find((d) => d.date)?.date ?? null,
    recordStart,
    eligibilityHint: eligibility?.val ?? input.summary.domainLabel,
    schoolHint: school?.val ?? "",
    documentCount: input.sourceDocuments.length,
    facts,
    factsByClaimId,
    docs,
    compareRows: buildCompareRows(input.caseMap),
    signals: buildSignals(input.summary, input.caseMap),
    fluencySeries,
    fluencyGoal,
    reevalFacts: pickReevalFacts(facts, fluencyIds),
    fluencyMeasureWarning:
      fluencySeries.length >= 2
        ? "Scores share a unit but may not be the same measure unless the test form is confirmed in each source."
        : undefined,
    timeline,
    timelineHoles: holes,
    integrity: buildIntegrity(docs, facts, input.provenance),
  };
}

export function formatFactDisplay(f: ProTypedFact): string {
  return f.unit ? `${f.val} ${f.unit}` : f.val;
}

export function monYear(date: string | null | undefined): string {
  if (!date || !/^\d{4}-\d{2}/.test(date)) {
    return "Undated";
  }
  const [y, m] = date.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1]} ${y}`;
}

export function buildProLivingExportJson(model: ProLivingModel) {
  return {
    case: {
      student: model.studentLabel,
      type: model.caseTypeLabel,
      asOf: model.asOfDate,
    },
    facts: model.facts.map((f) => ({
      claimId: f.claimId,
      attribute: f.attr,
      value: f.val,
      unit: f.unit ?? null,
      as_of: f.asOf ?? null,
      document: f.filename,
      document_role: f.docRole,
      page: f.page,
    })),
    comparison: model.compareRows
      .filter((r): r is Extract<ProCompareRow, { kind: "row" }> => r.kind === "row")
      .map((r) => ({
        item: r.label,
        state: r.state,
        prior: r.priorClaimIds ?? [],
        proposed: r.propClaimIds ?? [],
      })),
  };
}
