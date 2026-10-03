import type { CanonicalCaseSnapshot, ValidatedClaim } from "@hiveforyou/shared/case-intelligence/3";
import type {
  CardStatus,
  CaseDocument,
  CaseEntity,
  CaseHeader,
  CaseView,
  Chip,
  DisplayValue,
  DomainPackViewConfigV2,
  FactItem,
  PlanCard,
  PlanSection,
} from "@hiveforyou/shared/projections";
import {
  constructPartsFromCanonicalConstruct,
  constructRoot,
  displayValuesEqual,
  IEP_MEASURE_LABELS,
  iepSectionForMeasure,
  isIepProOnlyMeasure,
  normalizeMeasureRoot,
} from "@hiveforyou/shared/projections";

import {
  CLIENT_PLAN_HIDDEN_MEASURE_ROOTS,
  renderSectionOneLiner,
} from "./project-case-view-v2-plan-copy";
import type { FactRow } from "./project-case-view-v2-plan-types";

export type { FactRow } from "./project-case-view-v2-plan-types";

function measureLabel(measure: string): string {
  const root = constructRoot(measure);
  return IEP_MEASURE_LABELS[root] ?? root.replace(/_/g, " ");
}

function documentSortKey(doc: CaseDocument): string {
  return doc.documentDate?.trim() || "0000-01-01";
}

function isPlanLikeDocument(doc: CaseDocument): boolean {
  const hay = `${doc.documentType} ${doc.fileName}`.toLowerCase();
  return hay.includes("iep") && !hay.includes("progress") && !hay.includes("report");
}

function isEvaluationDocument(doc: CaseDocument): boolean {
  const hay = `${doc.documentType} ${doc.fileName}`.toLowerCase();
  return hay.includes("eval") || hay.includes("reeval") || hay.includes("assessment");
}

export function buildDocumentIndex(documents: CaseDocument[]): Map<string, { index: number; doc: CaseDocument }> {
  const sorted = [...documents].sort((a, b) => documentSortKey(a).localeCompare(documentSortKey(b)));
  const map = new Map<string, { index: number; doc: CaseDocument }>();
  sorted.forEach((doc, i) => {
    map.set(doc.logicalDocumentId, { index: i + 1, doc });
    map.set(doc.sourceDocumentId, { index: i + 1, doc });
  });
  return map;
}

export function formatChipFileName(chip: Chip, docIndex: Map<string, { index: number; doc: CaseDocument }>): string {
  const key = chip.logicalDocumentId ?? chip.sourceDocumentId;
  const row = docIndex.get(key);
  const idx = row?.index ?? 0;
  const nn = idx > 0 ? String(idx).padStart(2, "0") : "00";
  let title = row?.doc.fileName.replace(/\.pdf$/i, "").replace(/_/g, " ").trim() ?? "";
  if (!title || title.match(/^[0-9a-f-]{8}-/i)) {
    title = idx > 0 ? `Document ${nn}` : "Document";
  }
  if (title.length > 28) {
    title = `${title.slice(0, 25)}…`;
  }
  return `${nn} ${title}`;
}

export function remapChips(chips: Chip[], docIndex: Map<string, { index: number; doc: CaseDocument }>): Chip[] {
  return chips.map((chip) => ({
    ...chip,
    fileName: formatChipFileName(chip, docIndex),
  }));
}

function dedupeChips(chips: Chip[]): Chip[] {
  const seen = new Set<string>();
  const out: Chip[] = [];
  for (const chip of chips) {
    const key = `${chip.logicalDocumentId ?? chip.sourceDocumentId ?? ""}\0${chip.page}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(chip);
  }
  return out;
}

function primaryLogicalDoc(fact: FactItem): string {
  return fact.chips[0]?.logicalDocumentId ?? fact.chips[0]?.sourceDocumentId ?? "unknown";
}

function logUnmappedMeasures(v1: CaseView, caseId: string): void {
  const unmapped = new Set<string>();
  for (const item of v1.items) {
    if (item.state !== "established") {
      continue;
    }
    const measure = (item as FactItem).construct.measure;
    const root = normalizeMeasureRoot(constructRoot(measure));
    if (isIepProOnlyMeasure(measure)) {
      continue;
    }
    if (!iepSectionForMeasure(measure)) {
      unmapped.add(root);
    }
  }
  if (unmapped.size > 0) {
    console.info("[case-view/2] unmapped_measures", {
      caseId,
      measures: [...unmapped].sort(),
    });
  }
}

export function collectFactRowsForNarrative(v1: CaseView): FactRow[] {
  return collectFactRows(v1);
}

function collectFactRows(v1: CaseView): FactRow[] {
  const rows: FactRow[] = [];
  const docByLogical = new Map(v1.documents.map((d) => [d.logicalDocumentId, d]));

  for (const item of v1.items) {
    if (item.state !== "established") {
      continue;
    }
    const fact = item as FactItem;
    const measure = fact.construct.measure;
    if (isIepProOnlyMeasure(measure)) {
      continue;
    }
    const section = iepSectionForMeasure(measure);
    if (!section) {
      continue;
    }
    const logicalDocumentId = primaryLogicalDoc(fact);
    const doc = docByLogical.get(logicalDocumentId);
    if (!fact.value) {
      continue;
    }
    rows.push({
      itemId: fact.itemId,
      claimId: fact.itemId.startsWith("itm_fact_") ? fact.itemId.slice("itm_fact_".length) : null,
      measure,
      task: fact.construct.task,
      logicalDocumentId,
      documentSortKey: doc ? documentSortKey(doc) : "0000",
      display: fact.value,
      chips: fact.chips,
      isPlanDoc: doc ? isPlanLikeDocument(doc) : false,
    });
  }
  return rows;
}

function goalIdByDocument(intelligence: CanonicalCaseSnapshot): Map<string, string> {
  const map = new Map<string, string>();
  for (const claim of intelligence.claims) {
    const parts = constructPartsFromCanonicalConstruct(claim.construct);
    if (constructRoot(parts.measure) !== "annual_goal_id") {
      continue;
    }
    const val =
      claim.value.kind === "text"
        ? claim.value.text
        : claim.value.kind === "code"
          ? claim.value.code
          : null;
    if (!val?.trim()) {
      continue;
    }
    const docId = claim.evidenceRefs[0]?.logicalDocumentId ?? claim.evidenceRefs[0]?.sourceDocumentId;
    if (docId) {
      map.set(docId, val.trim());
    }
  }
  return map;
}

const GOAL_LINKED_MEASURES = new Set([
  "annual_goal_target",
  "baseline",
  "oral_reading_fluency",
  "annual_goal_target_met",
  "annual_goal_included",
]);

function componentKey(row: FactRow, goalIds: Map<string, string>): string {
  const section = iepSectionForMeasure(row.measure) ?? "other";
  const root = constructRoot(row.measure);
  if (section === "services" && row.task?.trim()) {
    return `task:${row.task.trim()}`;
  }
  if (section === "accommodations") {
    return "acc:extended_time";
  }
  if (section === "eligibility") {
    const root = constructRoot(row.measure);
    if (root === "eligibility_category" || root === "special_education_eligibility") {
      return "eligibility:category";
    }
    return "eligibility:need";
  }
  if (section === "evaluation") {
    return "evaluation:summary";
  }
  if (section === "dates") {
    return "dates:summary";
  }
  if (section === "goals" && GOAL_LINKED_MEASURES.has(root)) {
    void goalIds;
    const task = row.task?.trim() || "reading";
    return `goal:task:${task}`;
  }
  if (row.task?.trim()) {
    return `task:${row.task.trim()}`;
  }
  return `measure:${root}`;
}

function cardTitle(sectionId: string, componentKey: string, rows: FactRow[]): string {
  if (componentKey.startsWith("goal:")) {
    return "Reading fluency goal";
  }
  if (sectionId === "services") {
    return "Specialized reading instruction";
  }
  if (sectionId === "accommodations") {
    return "Extended time";
  }
  if (sectionId === "eligibility") {
    return componentKey.includes("category") ? "Eligibility category" : "Eligibility";
  }
  if (sectionId === "evaluation") {
    return "Evaluation";
  }
  if (sectionId === "dates") {
    return "Dates";
  }
  return measureLabel(rows[0]?.measure ?? "");
}

function rowsForMeasure(rows: FactRow[], measureRoot: string): FactRow[] {
  return rows.filter((r) => constructRoot(r.measure) === measureRoot);
}

function measureChangedAcrossDocuments(rows: FactRow[]): boolean {
  const byMeasure = new Map<string, FactRow[]>();
  for (const row of rows) {
    const root = constructRoot(row.measure);
    if (CLIENT_PLAN_HIDDEN_MEASURE_ROOTS.has(root)) {
      continue;
    }
    const list = byMeasure.get(root) ?? [];
    list.push(row);
    byMeasure.set(root, list);
  }

  for (const measureRows of byMeasure.values()) {
    const valueByDoc = new Map<string, DisplayValue>();
    for (const row of measureRows) {
      if (!row.display) {
        continue;
      }
      const prev = valueByDoc.get(row.logicalDocumentId);
      if (!prev) {
        valueByDoc.set(row.logicalDocumentId, row.display);
      }
    }
    const distinct: DisplayValue[] = [];
    for (const value of valueByDoc.values()) {
      if (!value) {
        continue;
      }
      if (!distinct.some((d) => displayValuesEqual(d, value))) {
        distinct.push(value);
      }
    }
    if (distinct.length >= 2) {
      return true;
    }
  }
  return false;
}

function componentLooksClear(rows: FactRow[], planDocIds: Set<string>): boolean {
  const planRows = rows.filter((r) => planDocIds.has(r.logicalDocumentId));
  const docsUsed = new Set(planRows.map((r) => r.logicalDocumentId));
  if (docsUsed.size < 2) {
    return false;
  }
  if (measureChangedAcrossDocuments(planRows)) {
    return false;
  }
  return true;
}

function isWorthQuestion(rows: FactRow[]): boolean {
  for (const row of rows) {
    if (!row.display) {
      continue;
    }
    const root = constructRoot(row.measure);
    if (root.endsWith("target_met") && row.display.kind === "boolean" && row.display.booleanValue === false) {
      return true;
    }
  }
  const targets = rowsForMeasure(rows, "annual_goal_target");
  const fluency = rowsForMeasure(rows, "oral_reading_fluency");
  if (targets.length && fluency.length) {
    const target = [...targets].sort((a, b) => b.documentSortKey.localeCompare(a.documentSortKey))[0]!;
    const latest = [...fluency].sort((a, b) => b.documentSortKey.localeCompare(a.documentSortKey))[0]!;
    if (
      !target.display ||
      !latest.display ||
      target.display.kind === "quantity" &&
      latest.display.kind === "quantity" &&
      target.display.numberValue != null &&
      latest.display.numberValue != null &&
      latest.display.numberValue < target.display.numberValue
    ) {
      return true;
    }
  }
  return false;
}

function goalFactsOnPlanDoc(rows: FactRow[], planDocId: string): boolean {
  return rows.some(
    (r) =>
      r.logicalDocumentId === planDocId &&
      ["annual_goal_target", "baseline", "annual_goal_included"].includes(constructRoot(r.measure)),
  );
}

function pickGoalDisplayContext(
  groupRows: FactRow[],
  currentPlanId: string | null,
  planDocs: CaseDocument[],
): { displayRows: FactRow[]; planContextPrefix: string | null; noGoalInCurrentPlan: boolean } {
  if (!currentPlanId) {
    return { displayRows: groupRows, planContextPrefix: null, noGoalInCurrentPlan: false };
  }
  const onCurrent = groupRows.filter((r) => r.logicalDocumentId === currentPlanId);
  const hasGoalOnCurrent = goalFactsOnPlanDoc(groupRows, currentPlanId);
  const includedFalse = onCurrent.some(
    (r) =>
      r.display &&
      constructRoot(r.measure) === "annual_goal_included" &&
      r.display.kind === "boolean" &&
      r.display.booleanValue === false,
  );
  if (hasGoalOnCurrent && !includedFalse) {
    return { displayRows: onCurrent, planContextPrefix: null, noGoalInCurrentPlan: false };
  }
  const priorPlan = planDocs.find((d) => d.logicalDocumentId !== currentPlanId);
  const priorRows = priorPlan
    ? groupRows.filter((r) => r.logicalDocumentId === priorPlan.logicalDocumentId)
    : [];
  const year = priorPlan?.documentDate?.slice(0, 4) ?? "earlier";
  const progressRows = groupRows.filter((r) => !r.isPlanDoc);
  const displayRows = [...priorRows, ...progressRows];
  return {
    displayRows: displayRows.length ? displayRows : groupRows,
    planContextPrefix: `In the ${year} IEP`,
    noGoalInCurrentPlan: includedFalse || !hasGoalOnCurrent,
  };
}

function pickCurrentRows(
  sectionId: string,
  rows: FactRow[],
  planDocs: CaseDocument[],
  evalDocs: CaseDocument[],
): { current: FactRow[]; prior: FactRow[] } {
  const sorted = [...rows].sort((a, b) => b.documentSortKey.localeCompare(a.documentSortKey));
  if (sectionId === "evaluation") {
    const currentDoc = evalDocs[0]?.logicalDocumentId ?? sorted[0]?.logicalDocumentId;
    return {
      current: sorted.filter((r) => r.logicalDocumentId === currentDoc),
      prior: sorted.filter((r) => r.logicalDocumentId !== currentDoc),
    };
  }
  if (sectionId === "dates") {
    const currentDoc = planDocs[0]?.logicalDocumentId ?? sorted[0]?.logicalDocumentId;
    return {
      current: sorted.filter((r) => r.logicalDocumentId === currentDoc),
      prior: sorted.filter((r) => r.logicalDocumentId !== currentDoc),
    };
  }
  const currentPlanId = planDocs[0]?.logicalDocumentId;
  if (!currentPlanId) {
    return { current: sorted, prior: [] };
  }
  return {
    current: sorted.filter((r) => r.logicalDocumentId === currentPlanId),
    prior: sorted.filter((r) => r.logicalDocumentId !== currentPlanId),
  };
}

function priorYearLabel(prior: FactRow[], documents: CaseDocument[]): string | null {
  if (!prior.length) {
    return null;
  }
  const doc = documents.find((d) => d.logicalDocumentId === prior[0]?.logicalDocumentId);
  const year = doc?.documentDate?.slice(0, 4);
  return year ? `Same as ${year}` : "Same as earlier plan";
}

export type AnatomyPlanResult = {
  sections: PlanSection[];
  cards: PlanCard[];
  statusCounts: CaseHeader["statusCounts"];
  currentPlanLabel: string | null;
  noReadingGoalInCurrentPlan: boolean;
  cardsById: Map<string, PlanCard>;
  cardContextById: Map<string, { rows: FactRow[]; noGoalInCurrentPlan: boolean }>;
};

export function buildAnatomyPlan(input: {
  v1: CaseView;
  intelligence: CanonicalCaseSnapshot;
  pack: DomainPackViewConfigV2 | null;
  docIndex: Map<string, { index: number; doc: CaseDocument }>;
}): AnatomyPlanResult {
  const { v1, intelligence, pack } = input;
  const entitiesById = new Map(v1.entities.map((e) => [e.entityId, e]));

  if (!pack) {
    return {
      sections: [],
      cards: [],
      statusCounts: { worthAsking: 0, changed: 0, missing: v1.counts.gaps, looksClear: 0 },
      currentPlanLabel: null,
      noReadingGoalInCurrentPlan: false,
      cardsById: new Map(),
      cardContextById: new Map(),
    };
  }

  logUnmappedMeasures(v1, intelligence.caseId);

  const planDocs = [...v1.documents]
    .filter(isPlanLikeDocument)
    .sort((a, b) => documentSortKey(b).localeCompare(documentSortKey(a)));
  const evalDocs = [...v1.documents]
    .filter(isEvaluationDocument)
    .sort((a, b) => documentSortKey(b).localeCompare(documentSortKey(a)));
  const planDocIds = new Set(planDocs.map((d) => d.logicalDocumentId));
  const currentPlanId = planDocs[0]?.logicalDocumentId ?? null;

  const currentPlanLabel = planDocs[0]
    ? `The ${planDocs[0].documentDate?.slice(0, 4) ?? ""} IEP`.replace("The  IEP", "The current IEP")
    : null;

  const rows = collectFactRows(v1);
  const goalIds = goalIdByDocument(intelligence);
  const groups = new Map<string, FactRow[]>();

  for (const row of rows) {
    const section = iepSectionForMeasure(row.measure);
    if (!section) {
      continue;
    }
    const key = `${section}\0${componentKey(row, goalIds)}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const cards: PlanCard[] = [];
  const sectionCardIds = new Map<string, string[]>();
  const cardContextById = new Map<string, { rows: FactRow[]; noGoalInCurrentPlan: boolean }>();
  let noReadingGoalInCurrentPlan = false;

  for (const [key, groupRows] of groups) {
    const [sectionId, compKey] = key.split("\0");
    const { prior } = pickCurrentRows(sectionId!, groupRows, planDocs, evalDocs);

    let displayRows = groupRows;
    let planContextPrefix: string | null = null;
    let noGoalInCurrentPlan = false;
    if (sectionId === "goals") {
      const goalCtx = pickGoalDisplayContext(groupRows, currentPlanId, planDocs);
      displayRows = goalCtx.displayRows;
      planContextPrefix = goalCtx.planContextPrefix;
      noGoalInCurrentPlan = goalCtx.noGoalInCurrentPlan;
      if (noGoalInCurrentPlan) {
        noReadingGoalInCurrentPlan = true;
      }
    } else if (sectionId === "eligibility") {
      displayRows = groupRows;
    } else if (currentPlanId) {
      const onCurrent = groupRows.filter((r) => r.logicalDocumentId === currentPlanId);
      displayRows = onCurrent.length ? onCurrent : groupRows;
    }

    if (!displayRows.length) {
      continue;
    }

    let status: CardStatus = "reference";
    if (sectionId === "evaluation" || sectionId === "dates") {
      status = "reference";
    } else if (isWorthQuestion(groupRows)) {
      status = "worth_a_question";
    } else if (measureChangedAcrossDocuments(groupRows)) {
      status = "changed";
    } else if (componentLooksClear(groupRows, planDocIds)) {
      status = "looks_clear";
    }

    const title = cardTitle(sectionId!, compKey ?? "", groupRows);
    const oneLiner = renderSectionOneLiner(sectionId!, displayRows, {
      currentPlanDocId: currentPlanId,
      planContextPrefix,
      entitiesById,
    });
    const sinceLine =
      status === "looks_clear"
        ? priorYearLabel(prior, v1.documents)
        : status === "changed" && prior.length
          ? priorYearLabel(prior, v1.documents)
          : null;

    const itemIds = [...new Set(groupRows.map((r) => r.itemId))];
    const chips = remapChips(dedupeChips(groupRows.flatMap((r) => r.chips)).slice(0, 6), input.docIndex);

    const cardId = `card_${sectionId}_${cards.length}`;
    cards.push({
      cardId,
      sectionId: sectionId!,
      entityId: compKey ?? sectionId!,
      title,
      status,
      itemIds,
      oneLiner,
      sinceLine,
      whyLine: null,
      questionId: null,
      chips,
    });
    cardContextById.set(cardId, { rows: groupRows, noGoalInCurrentPlan });
    const list = sectionCardIds.get(sectionId!) ?? [];
    list.push(cardId);
    sectionCardIds.set(sectionId!, list);
  }

  const sectionOrder = pack.anatomy.sections.map((s) => s.sectionId);
  const sections: PlanSection[] = sectionOrder
    .filter((id) => (sectionCardIds.get(id)?.length ?? 0) > 0)
    .map((sectionId) => ({
      sectionId,
      label: pack.anatomy.sections.find((s) => s.sectionId === sectionId)?.label.toUpperCase() ?? sectionId,
      cardIds: sectionCardIds.get(sectionId) ?? [],
    }));

  const statusCounts = {
    worthAsking: cards.filter((c) => c.status === "worth_a_question").length,
    changed: cards.filter((c) => c.status === "changed").length,
    missing: v1.counts.gaps,
    looksClear: cards.filter((c) => c.status === "looks_clear").length,
  };

  return {
    sections,
    cards,
    statusCounts,
    currentPlanLabel,
    noReadingGoalInCurrentPlan,
    cardsById: new Map(cards.map((c) => [c.cardId, c])),
    cardContextById,
  };
}
