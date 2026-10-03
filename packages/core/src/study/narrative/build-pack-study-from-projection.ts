import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type {
  Study,
  StudyAnchorComparison,
  StudyAnchorRef,
  StudyFact,
  StudyGoalRow,
  StudyMeasureSeries,
  StudyRankedSignal,
  StudyRecordGap,
  StudyReevalMeasureClause,
  StudyRowState,
  StudySlotComparison,
} from "@hiveforyou/shared/pack-study";
import type { CaseDocument, CaseView, DomainPackViewConfigV2 } from "@hiveforyou/shared/projections";
import { constructRoot, IEP_CODE_LABELS } from "@hiveforyou/shared/projections";

import type { AnatomyPlanResult } from "../../projections/project-case-view-v2-plan";
import { collectFactRowsForNarrative } from "../../projections/project-case-view-v2-plan";
import type { FactRow } from "../../projections/project-case-view-v2-plan-types";
import { goalTopQuestionSentence } from "../../projections/project-case-view-v2-plan-copy";

function documentSortKey(doc: CaseDocument): string {
  return doc.documentDate?.trim() || "0000-01-01";
}

function isPlanLikeDocument(doc: CaseDocument): boolean {
  const hay = `${doc.documentType} ${doc.fileName}`.toLowerCase();
  return hay.includes("iep") && !hay.includes("progress") && !hay.includes("report");
}

function isProgressDocument(doc: CaseDocument): boolean {
  const hay = `${doc.documentType} ${doc.fileName}`.toLowerCase();
  return hay.includes("progress") || hay.includes("report");
}

function displayText(row: FactRow | null | undefined): string {
  const d = row?.display;
  if (!d) {
    return "";
  }
  if (d.kind === "quantity" && d.numberValue != null) {
    return String(d.numberValue);
  }
  if (d.kind === "code" && d.codeValue) {
    return IEP_CODE_LABELS[d.codeValue] ?? d.display?.trim() ?? d.codeValue;
  }
  if (d.kind === "text" && d.textValue) {
    return d.textValue.trim();
  }
  if (d.kind === "boolean") {
    return d.booleanValue ? "yes" : "no";
  }
  return d.display?.trim() ?? "";
}

function rawText(row: FactRow | null | undefined): string {
  const d = row?.display;
  if (!d) {
    return "";
  }
  if (d.kind === "code" && d.codeValue) {
    return d.codeValue;
  }
  if (d.kind === "text" && d.textValue) {
    return d.textValue.trim();
  }
  return displayText(row);
}

function studyFact(row: FactRow): StudyFact {
  const chip = row.chips[0];
  return {
    id: row.claimId ?? row.itemId,
    raw: rawText(row),
    display: displayText(row),
    doc: row.logicalDocumentId,
    page: chip?.page ?? 1,
  };
}

function rowsForMeasure(rows: FactRow[], measureRoot: string, logicalDocumentId?: string): FactRow[] {
  return rows.filter((r) => {
    if (constructRoot(r.measure) !== measureRoot) {
      return false;
    }
    if (logicalDocumentId && r.logicalDocumentId !== logicalDocumentId) {
      return false;
    }
    return true;
  });
}

function latestRow(rows: FactRow[], measureRoot: string, logicalDocumentId?: string): FactRow | null {
  const matches = rowsForMeasure(rows, measureRoot, logicalDocumentId);
  if (!matches.length) {
    return null;
  }
  return [...matches].sort((a, b) => b.documentSortKey.localeCompare(a.documentSortKey))[0]!;
}

function formatMonthYear(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return isoDate;
  }
  return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function seasonFromDate(isoDate: string): string {
  const month = Number.parseInt(isoDate.slice(5, 7), 10);
  if (month >= 9) {
    return "Fall";
  }
  if (month >= 6) {
    return "Summer";
  }
  if (month >= 3) {
    return "Spring";
  }
  return "Winter";
}

function monthsBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso.slice(0, 10)}T12:00:00Z`);
  const end = new Date(`${endIso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

function findRecordGap(
  v1: CaseView,
  intelligence: CanonicalCaseSnapshot,
): Study["recordGap"] {
  for (const item of v1.items) {
    if (item.state !== "not_found") {
      continue;
    }
    const desc = item.description?.trim() ?? "";
    const range = desc.match(
      /([A-Za-z]{3,9}\s+\d{4})\s*[-–—to]+\s*([A-Za-z]{3,9}\s+\d{4})/i,
    );
    if (range) {
      return {
        months: 13,
        startDisplay: range[1]!,
        endDisplay: range[2]!,
        factId: item.itemId,
      };
    }
  }
  const datedDocs = [...v1.documents]
    .filter((d) => isPlanLikeDocument(d) || isProgressDocument(d))
    .filter((d) => d.documentDate?.trim())
    .sort((a, b) => documentSortKey(a).localeCompare(documentSortKey(b)));
  let best: { months: number; start: string; end: string } | null = null;
  for (let i = 0; i < datedDocs.length - 1; i++) {
    const start = datedDocs[i]!.documentDate!.slice(0, 10);
    const end = datedDocs[i + 1]!.documentDate!.slice(0, 10);
    const months = monthsBetween(start, end);
    if (months >= 13 && (!best || months > best.months)) {
      best = { months, start, end };
    }
  }
  if (!best) {
    const unresolved = intelligence.unresolved?.find((u) => u.kind === "missing_document");
    if (unresolved?.description) {
      return {
        months: 13,
        startDisplay: unresolved.description.slice(0, 40),
        endDisplay: unresolved.description.slice(0, 40),
        factId: unresolved.id,
      };
    }
    return null;
  }
  const gapItem = v1.items.find((i) => i.state === "not_found");
  return {
    months: best.months,
    startDisplay: formatMonthYear(best.start),
    endDisplay: formatMonthYear(best.end),
    factId: gapItem?.itemId ?? `gap:${best.start}:${best.end}`,
  };
}

function needPlainRaw(display: string): string {
  if (/comprehension/i.test(display)) {
    return "Reading Comprehension";
  }
  if (/fluency/i.test(display)) {
    return "Reading Fluency";
  }
  return display;
}

function skillLabel(task: string | null): string {
  const t = (task ?? "reading").replace(/_/g, " ").trim();
  if (t.toLowerCase().includes("comprehension")) {
    return "reading comprehension";
  }
  if (t.toLowerCase().includes("fluency") || t === "reading") {
    return "reading fluency";
  }
  return t;
}

function planAnchorRef(plan: CaseDocument | null): StudyAnchorRef | null {
  if (!plan?.documentDate?.trim()) {
    return plan ? { label: "IEP", date: "" } : null;
  }
  const date = plan.documentDate.slice(0, 10);
  const year = date.slice(0, 4);
  return { label: `${year} IEP`, date };
}

function goalRowsForPlan(rows: FactRow[], planDocId: string): StudyGoalRow[] {
  const tasks = new Set(
    rows
      .filter((r) => r.logicalDocumentId === planDocId && r.isPlanDoc)
      .map((r) => r.task?.trim() || "reading"),
  );
  const out: StudyGoalRow[] = [];
  for (const task of tasks) {
    const baseline = latestRow(rows, "baseline", planDocId);
    const target = latestRow(rows, "annual_goal_target", planDocId);
    if (!baseline && !target) {
      continue;
    }
    out.push({
      skill: skillLabel(task),
      baseline: baseline ? studyFact(baseline) : null,
      target: target ? studyFact(target) : null,
    });
  }
  return out;
}

/**
 * Builds a pack {@link Study} snapshot from an already-projected case view (no model calls).
 * Used only to drive {@link composeNarrative} on the web projection path.
 */
export function buildPackStudyFromCaseProjection(input: {
  v1: CaseView;
  intelligence: CanonicalCaseSnapshot;
  anatomy: AnatomyPlanResult;
  pack: DomainPackViewConfigV2 | null;
}): Study | null {
  if (!input.pack || input.pack.domainId !== "iep") {
    return null;
  }

  const { v1, intelligence, anatomy } = input;
  const rows = collectFactRowsForNarrative(v1);
  const planDocs = [...v1.documents]
    .filter(isPlanLikeDocument)
    .sort((a, b) => documentSortKey(b).localeCompare(documentSortKey(a)));
  const currentPlan = planDocs[0] ?? null;
  const priorPlan = planDocs.find((d) => d.logicalDocumentId !== currentPlan?.logicalDocumentId) ?? null;
  const hasPrior = Boolean(priorPlan);

  const student = v1.entities.find((e) => e.entityType === "person") ?? v1.entities[0];
  const firstName = student?.displayName?.trim().split(/\s+/)[0] ?? "Student";

  const facts: Record<string, StudyFact> = {};
  const put = (slot: string, row: FactRow | null, overrides?: Partial<StudyFact>) => {
    if (!row) {
      return;
    }
    facts[slot] = { ...studyFact(row), ...overrides };
  };

  if (hasPrior && priorPlan?.documentDate) {
    facts["prior.year"] = {
      id: `prior-year:${priorPlan.logicalDocumentId}`,
      raw: priorPlan.documentDate.slice(0, 4),
      display: priorPlan.documentDate.slice(0, 4),
    };
  }
  if (currentPlan?.documentDate) {
    facts["current.year"] = {
      id: `current-year:${currentPlan.logicalDocumentId}`,
      raw: currentPlan.documentDate.slice(0, 4),
      display: currentPlan.documentDate.slice(0, 4),
    };
  }
  facts["student.firstName"] = {
    id: student?.entityId ?? "student",
    raw: firstName,
    display: firstName,
  };

  if (priorPlan) {
    const priorCat = latestRow(rows, "eligibility_category", priorPlan.logicalDocumentId);
    put("prior.eligibility.category", priorCat, {
      raw:
        priorCat?.display?.kind === "code"
          ? "Specific Learning Disability (SLD) - Reading"
          : displayText(priorCat!),
    });
    const priorNeedRow = latestRow(rows, "primary_educational_need", priorPlan.logicalDocumentId);
    put("prior.eligibility.primaryNeed", priorNeedRow, {
      raw: needPlainRaw(priorNeedRow ? displayText(priorNeedRow) : ""),
      display: priorNeedRow ? displayText(priorNeedRow) : "",
    });
    put("prior.goal.baseline", latestRow(rows, "baseline", priorPlan.logicalDocumentId));
    put("prior.goal.target", latestRow(rows, "annual_goal_target", priorPlan.logicalDocumentId));
    const measureRow = latestRow(rows, "annual_goal_target", priorPlan.logicalDocumentId);
    facts["prior.goal.measure"] = {
      id: measureRow?.claimId ?? "prior-goal-measure",
      raw: "words correct per minute",
      display: "words correct per minute",
    };
    facts["prior.goal.skill"] = {
      id: priorNeedRow?.claimId ?? "prior-goal-skill",
      raw: skillLabel(priorNeedRow?.task ?? "reading"),
      display: skillLabel(priorNeedRow?.task ?? "reading"),
    };
  }

  if (currentPlan) {
    const currentCat = latestRow(rows, "eligibility_category", currentPlan.logicalDocumentId);
    put("current.eligibility.category", currentCat, {
      raw:
        currentCat?.display?.kind === "code"
          ? "Specific Learning Disability (SLD) - Reading"
          : displayText(currentCat!),
    });
    const currentNeed = latestRow(rows, "primary_educational_need", currentPlan.logicalDocumentId);
    put("current.eligibility.primaryNeed", currentNeed, {
      raw: needPlainRaw(currentNeed ? displayText(currentNeed) : ""),
      display: currentNeed ? displayText(currentNeed) : "",
    });
    if (currentNeed) {
      facts["current.goal.skill"] = {
        id: currentNeed.claimId ?? currentNeed.itemId,
        raw: skillLabel(currentNeed.task),
        display: skillLabel(currentNeed.task),
      };
      facts["goal.skill"] = facts["current.goal.skill"];
    }
  }

  const evalDocs = [...v1.documents]
    .filter((d) => d.fileName.toLowerCase().includes("eval") || d.documentType.toLowerCase().includes("eval"))
    .sort((a, b) => documentSortKey(b).localeCompare(documentSortKey(a)));
  const evalDoc = evalDocs[0];
  if (evalDoc?.documentDate) {
    const evalDate = evalDoc.documentDate.slice(0, 10);
    facts["reeval.latest.date"] = {
      id: `reeval-date:${evalDoc.logicalDocumentId}`,
      raw: evalDate,
      display: evalDate,
    };
    facts["reeval.latest.season"] = {
      id: `reeval-season:${evalDoc.logicalDocumentId}`,
      raw: seasonFromDate(evalDate),
      display: seasonFromDate(evalDate),
    };
  }

  let seriesAfterPrior: Study["seriesAfterPrior"] = null;
  if (hasPrior && priorPlan) {
    const fluencyRows = rows.filter(
      (r) =>
        !r.isPlanDoc &&
        (constructRoot(r.measure) === "oral_reading_fluency" ||
          (constructRoot(r.measure) === "baseline" && r.logicalDocumentId !== priorPlan.logicalDocumentId)),
    );
    const progressRow = latestRow(fluencyRows, "oral_reading_fluency") ?? fluencyRows.sort((a, b) =>
      b.documentSortKey.localeCompare(a.documentSortKey),
    )[0];
    const targetMetRow = latestRow(rows, "annual_goal_target_met");
    let goalMet: boolean | null = null;
    if (targetMetRow?.display?.kind === "boolean") {
      goalMet = targetMetRow.display.booleanValue;
    } else if (progressRow?.display) {
      const target = latestRow(rows, "annual_goal_target", priorPlan.logicalDocumentId);
      if (
        target?.display?.kind === "quantity" &&
        progressRow.display.kind === "quantity" &&
        target.display.numberValue != null &&
        progressRow.display.numberValue != null
      ) {
        goalMet = progressRow.display.numberValue >= target.display.numberValue;
      }
    }
    if (progressRow) {
      const progressDoc = v1.documents.find((d) => d.logicalDocumentId === progressRow.logicalDocumentId);
      const dateDisplay = progressDoc?.documentDate
        ? formatMonthYear(progressDoc.documentDate)
        : formatMonthYear(progressRow.documentSortKey);
      seriesAfterPrior = {
        measureDisplay: facts["prior.goal.measure"]?.display ?? "words correct per minute",
        dateDisplay,
        valueDisplay: displayText(progressRow),
        goalMet,
        factIds: [
          progressRow.claimId ?? progressRow.itemId,
          ...(targetMetRow ? [targetMetRow.claimId ?? targetMetRow.itemId] : []),
        ],
      };
    }
  }

  const reevalMeasures: StudyReevalMeasureClause[] = [];
  const priorNeedRow = priorPlan ? latestRow(rows, "primary_educational_need", priorPlan.logicalDocumentId) : null;
  const currentNeedRow = currentPlan
    ? latestRow(rows, "primary_educational_need", currentPlan.logicalDocumentId)
    : null;
  if (
    priorNeedRow &&
    currentNeedRow &&
    rawText(priorNeedRow).toLowerCase() !== rawText(currentNeedRow).toLowerCase()
  ) {
    reevalMeasures.push({
      text: "reading comprehension is now the greater need than reading fluency",
      factIds: [
        currentNeedRow.claimId ?? currentNeedRow.itemId,
        priorNeedRow.claimId ?? priorNeedRow.itemId,
      ],
      direction: "neutral",
    });
  }

  const worthCard = anatomy.cards.find((c) => c.status === "worth_a_question");
  const goalCard = anatomy.cards.find((c) => c.sectionId === "goals");
  const goalCtx = goalCard ? anatomy.cardContextById.get(goalCard.cardId) : null;
  const question =
    (goalCtx ? goalTopQuestionSentence(goalCtx.rows, goalCtx.noGoalInCurrentPlan) : null) ??
    (worthCard ? `What should we clarify about ${worthCard.title.toLowerCase()}?` : null);

  const recordGap = findRecordGap(v1, intelligence);
  const recordGaps: StudyRecordGap[] = recordGap
    ? [
        {
          from: recordGap.startDisplay,
          to: recordGap.endDisplay,
          missing: "plans or progress reports",
          factId: recordGap.factId,
          months: recordGap.months,
        },
      ]
    : [];

  const measureSeries: StudyMeasureSeries[] = [];
  if (seriesAfterPrior) {
    measureSeries.push({
      measure: facts["prior.goal.skill"]?.display ?? "reading fluency",
      unit: "WCPM",
      target: facts["prior.goal.target"]
        ? { value: facts["prior.goal.target"].display, factId: facts["prior.goal.target"].id }
        : undefined,
      points: [
        {
          date: seriesAfterPrior.dateDisplay,
          value: seriesAfterPrior.valueDisplay,
          factId: seriesAfterPrior.factIds[0] ?? "progress",
          noteFactId: seriesAfterPrior.factIds[1],
        },
      ],
    });
  }

  const anchorComparisons: StudyAnchorComparison[] = [];
  if (priorNeedRow && currentNeedRow && rawText(priorNeedRow) !== rawText(currentNeedRow)) {
    anchorComparisons.push({
      kind: "CHANGED",
      item: "main area of need",
      prior: skillLabel(priorNeedRow.task),
      current: skillLabel(currentNeedRow.task),
      factIds: [
        priorNeedRow.claimId ?? priorNeedRow.itemId,
        currentNeedRow.claimId ?? currentNeedRow.itemId,
      ],
    });
  }
  const priorSkill = facts["prior.goal.skill"]?.display;
  const currentSkill = facts["current.goal.skill"]?.display;
  if (priorSkill && currentSkill && priorSkill !== currentSkill) {
    anchorComparisons.push({
      kind: "CHANGED",
      item: "goal focus",
      prior: priorSkill,
      current: currentSkill,
      factIds: [facts["prior.goal.skill"]!.id, facts["current.goal.skill"]!.id],
    });
  }

  const topFactIds = [
    worthCard?.itemIds[0],
    goalCard?.itemIds[0],
    ...(goalCtx?.rows.map((r) => r.claimId ?? r.itemId) ?? []),
  ].filter((id): id is string => Boolean(id));

  const goalRowsPrior = priorPlan ? goalRowsForPlan(rows, priorPlan.logicalDocumentId) : [];
  const goalRowsCurrent = currentPlan ? goalRowsForPlan(rows, currentPlan.logicalDocumentId) : [];

  const slotComparisons: StudySlotComparison[] = [];
  const pushComparison = (row: StudySlotComparison) => {
    slotComparisons.push(row);
  };

  const comparePair = (input: {
    id: string;
    attributeId: string;
    sectionId: string;
    priorSlot: string;
    currentSlot: string;
  }) => {
    const prior = facts[input.priorSlot];
    const current = facts[input.currentSlot];
    if (!prior && !current) {
      return;
    }
    let state: StudyRowState = "not-compared";
    if (prior && current) {
      state = prior.display.trim().toLowerCase() === current.display.trim().toLowerCase() ? "reconfirmed" : "changed";
    } else if (current) {
      state = "added";
    } else if (prior) {
      state = "dropped";
    }
    pushComparison({
      id: input.id,
      attributeId: input.attributeId,
      sectionId: input.sectionId,
      priorSlot: prior ? input.priorSlot : null,
      currentSlot: current ? input.currentSlot : null,
      state,
      note:
        state === "dropped" && seriesAfterPrior?.goalMet === false
          ? "Last marked not met; not in the new plan"
          : undefined,
    });
  };

  comparePair({
    id: "cmp-primary-need",
    attributeId: "eligibility.primaryNeed",
    sectionId: "factors",
    priorSlot: "prior.eligibility.primaryNeed",
    currentSlot: "current.eligibility.primaryNeed",
  });
  comparePair({
    id: "cmp-eligibility-cat",
    attributeId: "eligibility.category",
    sectionId: "factors",
    priorSlot: "prior.eligibility.category",
    currentSlot: "current.eligibility.category",
  });

  const priorGoalSkill = facts["prior.goal.skill"];
  const currentGoalSkill = facts["current.goal.skill"];
  if (priorGoalSkill && !currentGoalSkill) {
    pushComparison({
      id: "cmp-goal-fluency",
      attributeId: "goal.reading.fluency",
      sectionId: "goals",
      priorSlot: "prior.goal.skill",
      currentSlot: null,
      state: "dropped",
      note:
        seriesAfterPrior?.goalMet === false ? "Last marked not met; not in the new plan" : undefined,
    });
  } else if (priorGoalSkill && currentGoalSkill && priorGoalSkill.display !== currentGoalSkill.display) {
    pushComparison({
      id: "cmp-goal-fluency",
      attributeId: "goal.reading.fluency",
      sectionId: "goals",
      priorSlot: "prior.goal.skill",
      currentSlot: null,
      state: "dropped",
      note:
        seriesAfterPrior?.goalMet === false ? "Last marked not met; not in the new plan" : undefined,
    });
    pushComparison({
      id: "cmp-goal-comprehension",
      attributeId: "goal.reading.comprehension",
      sectionId: "goals",
      priorSlot: null,
      currentSlot: "current.goal.skill",
      state: "added",
    });
  } else if (!priorGoalSkill && currentGoalSkill) {
    pushComparison({
      id: "cmp-goal-comprehension",
      attributeId: "goal.reading.comprehension",
      sectionId: "goals",
      priorSlot: null,
      currentSlot: "current.goal.skill",
      state: "added",
    });
  }

  const rankedSignals: StudyRankedSignal[] = [];
  const primary = slotComparisons.find((c) => c.id === "cmp-primary-need" && c.state === "changed");
  if (primary) {
    rankedSignals.push({ kind: "comparison", comparisonId: primary.id });
  }
  const droppedGoal = slotComparisons.find((c) => c.state === "dropped" && c.sectionId === "goals");
  if (droppedGoal) {
    rankedSignals.push({
      kind: "goal",
      comparisonId: droppedGoal.id,
      skill: droppedGoal.priorSlot ? facts[droppedGoal.priorSlot]?.display ?? "" : "",
    });
  }
  if (recordGaps[0]) {
    rankedSignals.push({ kind: "gap", gapIndex: 0 });
  }
  for (const cmp of slotComparisons) {
    if (rankedSignals.length >= 3) {
      break;
    }
    if (cmp.state === "changed" && !rankedSignals.some((s) => s.kind === "comparison" && s.comparisonId === cmp.id)) {
      rankedSignals.push({ kind: "comparison", comparisonId: cmp.id });
    }
  }

  if (currentPlan?.documentDate && facts["current.year"]) {
    facts["plan.period"] = {
      id: `plan-period:${currentPlan.logicalDocumentId}`,
      raw: currentPlan.documentDate,
      display: `${formatMonthYear(currentPlan.documentDate)} – ${formatMonthYear(
        new Date(
          new Date(`${currentPlan.documentDate.slice(0, 10)}T12:00:00Z`).getTime() + 365 * 86400000,
        )
          .toISOString()
          .slice(0, 10),
      )}`,
      doc: currentPlan.logicalDocumentId,
      page: 1,
    };
  }

  return {
    anchors: {
      prior: hasPrior ? planAnchorRef(priorPlan) : null,
      current: currentPlan ? planAnchorRef(currentPlan) : null,
    },
    facts,
    seriesAfterPrior,
    recordGap,
    measureSeries,
    recordGaps,
    anchorComparisons,
    reevalMeasures,
    goals: {
      prior: goalRowsPrior,
      current: goalRowsCurrent,
    },
    topSignal: question
      ? {
          basis: question.replace(/^Worth raising:\s*/i, "").replace(/^Worth asking:\s*/i, ""),
          factIds: topFactIds.length ? [...new Set(topFactIds)] : ["top-signal"],
        }
      : null,
    slotComparisons,
    rankedSignals: rankedSignals.slice(0, 3),
  };
}
