import type { CaseMap } from "@hiveforyou/shared/projections";
import type {
  CaseView,
  ChangeItem,
  ConflictItem,
  FactItem,
  NotFoundItem,
} from "@hiveforyou/shared/projections";

import type { ProvenanceIndex } from "@/lib/case/provenance-index";

import type { CaseSummaryModel } from "./case-summary-presentation";
import {
  buildCompareRows,
  buildIntegrity,
  buildProLivingModel,
  pickFluencyFacts,
  pickGoalTarget,
  pickReevalFacts,
  type ProDocMeta,
  type ProLivingModel,
  type ProReviewSignal,
  type ProTypedFact,
} from "./case-summary-pro-living";

function buildFactsFromCaseView(caseView: CaseView): { facts: ProTypedFact[]; docs: ProDocMeta[] } {
  const facts: ProTypedFact[] = [];
  for (const item of caseView.items) {
    if (item.state !== "established") {
      continue;
    }
    const fact = item as FactItem;
    const chip = fact.chips[0];
    if (!chip) {
      continue;
    }
    const docMeta = caseView.documents.find(
      (doc) =>
        doc.logicalDocumentId === chip.logicalDocumentId ||
        doc.sourceDocumentId === chip.sourceDocumentId,
    );
    facts.push({
      id: fact.claimId,
      claimId: fact.claimId,
      attr: fact.label,
      val: fact.value.display,
      unit: fact.value.unit ?? undefined,
      asOf: fact.occurredOn ?? undefined,
      sourceDocumentId: chip.sourceDocumentId,
      docRole: docMeta?.documentType ?? docMeta?.fileName ?? chip.fileName,
      filename: chip.fileName,
      page: chip.page,
    });
  }

  const docs: ProDocMeta[] = caseView.documents.map((doc) => ({
    id: doc.sourceDocumentId,
    role: doc.documentType,
    file: doc.fileName,
    date: doc.documentDate,
  }));

  return { facts, docs };
}

function buildSignalsFromCaseView(caseView: CaseView, summary: CaseSummaryModel): ProReviewSignal[] {
  const byId = new Map(caseView.items.map((item) => [item.itemId, item]));
  const orderedIds = [
    ...caseView.layout.needsDecision.inFocus,
    ...caseView.layout.changed,
    ...caseView.layout.gaps,
  ].slice(0, 3);

  const fromLayout = orderedIds
    .map((itemId) => byId.get(itemId))
    .filter(Boolean)
    .map((item) => {
      if (item!.state === "conflicting") {
        const conflict = item as ConflictItem;
        return {
          state: "changed" as const,
          headline: conflict.label,
          detail: "Conflicting validated sources",
          claimIds: conflict.sides.map((side) => side.claimId),
          question: `Which value should govern ${conflict.label.toLowerCase()}?`,
        };
      }
      if (item!.state === "changed") {
        const change = item as ChangeItem;
        return {
          state: "changed" as const,
          headline: change.label,
          detail: "Value changed across documents",
          claimIds: change.series.map((point) => point.claimId),
          question: `What explains the change in ${change.label.toLowerCase()}?`,
        };
      }
      if (item!.state === "not_found") {
        const gap = item as NotFoundItem;
        return {
          state: "gap" as const,
          headline: gap.label,
          detail: gap.description,
          claimIds: [],
          searched: true,
          question: `Can you supply ${gap.request.label.toLowerCase()}?`,
        };
      }
      return null;
    })
    .filter(Boolean) as ProReviewSignal[];

  if (fromLayout.length) {
    return fromLayout;
  }

  return caseView.clientSummary.items.slice(0, 3).map((row) => ({
    state: "changed" as const,
    headline: row.text.split(".")[0] ?? row.text,
    detail: row.text,
    claimIds: [],
    question: row.worthAsking,
  }));
}

function buildTimelineFromCaseView(caseView: CaseView) {
  const dated = caseView.documents
    .map((doc) => ({
      docId: doc.sourceDocumentId,
      date: doc.documentDate,
      undated: !doc.documentDate,
    }))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  return { timeline: dated, holes: [] as ProLivingModel["timelineHoles"] };
}

/** Pro living model from persisted case-view; prior/proposed compare still from case map. */
export function buildProLivingModelFromCaseView(input: {
  caseView: CaseView;
  caseMap: CaseMap;
  summary: CaseSummaryModel;
  provenance: ProvenanceIndex | null;
  studiedAt?: string | null;
}): ProLivingModel {
  const { facts, docs } = buildFactsFromCaseView(input.caseView);
  const factsByClaimId = new Map(facts.map((fact) => [fact.claimId, fact]));
  const fluencySeries = pickFluencyFacts(facts);
  const fluencyGoal = pickGoalTarget(facts);
  const fluencyIds = new Set(fluencySeries.map((fact) => fact.id));
  const { timeline, holes } = buildTimelineFromCaseView(input.caseView);

  const student = input.caseView.entities.find((entity) =>
    entity.entityType.toLowerCase().includes("student"),
  );
  const eligibility = facts.find((fact) => fact.attr.toLowerCase().includes("eligibility"));
  const school = facts.find((fact) => fact.attr.toLowerCase().includes("school"));

  const datedFacts = facts.filter((fact) => fact.asOf && /^\d{4}-\d{2}/.test(fact.asOf));
  const recordStart =
    datedFacts.length > 0
      ? datedFacts.map((fact) => fact.asOf!).sort()[0]!
      : docs.find((doc) => doc.date)?.date ?? null;

  return {
    studentLabel: student?.displayName?.trim() || "Your case",
    caseTypeLabel: input.summary.domainLabel.includes("IEP")
      ? "Reevaluation"
      : input.summary.domainLabel,
    asOfDate: input.studiedAt ?? docs.find((doc) => doc.date)?.date ?? null,
    recordStart,
    eligibilityHint: eligibility?.val ?? input.summary.domainLabel,
    schoolHint: school?.val ?? "",
    documentCount: input.caseView.documents.length,
    facts,
    factsByClaimId,
    docs,
    compareRows: buildCompareRows(input.caseMap),
    signals: buildSignalsFromCaseView(input.caseView, input.summary),
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

/** Prefer case-view facts; fall back to legacy claim-based model when caseView is absent. */
export function buildProLivingModelForBundle(input: {
  caseView?: CaseView | null;
  caseMap: CaseMap;
  summary: CaseSummaryModel;
  claims: import("@hiveforyou/shared/canonical-study").ProposedClaim[];
  provenance: ProvenanceIndex | null;
  sourceDocuments: Array<{ sourceDocumentId: string; originalFilename: string }>;
  entities?: Array<{ label: string; entityType: string }>;
  studiedAt?: string | null;
}): ProLivingModel {
  if (input.caseView) {
    return buildProLivingModelFromCaseView({
      caseView: input.caseView,
      caseMap: input.caseMap,
      summary: input.summary,
      provenance: input.provenance,
      studiedAt: input.studiedAt,
    });
  }
  return buildProLivingModel({
    caseMap: input.caseMap,
    summary: input.summary,
    claims: input.claims,
    provenance: input.provenance,
    sourceDocuments: input.sourceDocuments,
    entities: input.entities,
    studiedAt: input.studiedAt,
  });
}
