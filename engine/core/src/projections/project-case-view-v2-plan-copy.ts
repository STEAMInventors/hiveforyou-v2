import type { CaseEntity, DisplayValue } from "@hiveforyou/shared/projections";
import { constructRoot, IEP_CODE_LABELS, IEP_UNIT_DISPLAY } from "@hiveforyou/shared/projections";

import type { FactRow } from "./project-case-view-v2-plan-types";

export const CLIENT_PLAN_HIDDEN_MEASURE_ROOTS = new Set([
  "annual_goal_id",
  "mastery_probe_count",
  "progress_reporting_frequency",
  "baseline_accuracy",
  "annual_goal_target_accuracy",
]);

function qty(display: DisplayValue | null | undefined): { n: number; unit: string } | null {
  if (!display || display.kind !== "quantity" || display.numberValue == null) {
    return null;
  }
  const unitRaw = display.unit?.trim() ?? "";
  const unit =
    IEP_UNIT_DISPLAY[unitRaw] ?? (unitRaw === "x" ? "×" : unitRaw.replace(/_/g, " "));
  return { n: display.numberValue, unit };
}

function codeLabel(display: DisplayValue | null | undefined): string | null {
  if (!display || display.kind !== "code" || !display.codeValue?.trim()) {
    return null;
  }
  return IEP_CODE_LABELS[display.codeValue] ?? display.codeValue.replace(/_/g, " ");
}

function formatQty(n: number, unit: string): string {
  if (unit === "words per minute" || unit === "WCPM") {
    return `${n} words per minute`;
  }
  if (unit === "sessions per week") {
    return `${n} sessions a week`;
  }
  if (unit === "minutes per session") {
    return `${n} minutes each`;
  }
  if (unit === "×") {
    return `${n}×`;
  }
  return unit ? `${n} ${unit}` : String(n);
}

function latestRow(rows: FactRow[], measureRoot: string): FactRow | null {
  const matches = rows.filter((r) => constructRoot(r.measure) === measureRoot);
  if (!matches.length) {
    return null;
  }
  return [...matches].sort((a, b) => b.documentSortKey.localeCompare(a.documentSortKey))[0]!;
}

function rowFromPlanDoc(rows: FactRow[], measureRoot: string, planDocId: string | null): FactRow | null {
  if (!planDocId) {
    return null;
  }
  return (
    rows.find((r) => constructRoot(r.measure) === measureRoot && r.logicalDocumentId === planDocId) ?? null
  );
}

function fillTemplate(template: string, fields: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(fields)) {
    out = out.replaceAll(`{${key}}`, value);
  }
  return out
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .trim();
}

function dropEmptyClauses(sentence: string): string {
  return sentence
    .split(".")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/\{\w+\}/.test(part))
    .join(". ")
    .trim();
}

export function renderGoalsOneLiner(input: {
  rows: FactRow[];
  currentPlanDocId: string | null;
  planContextPrefix: string | null;
  entitiesById: Map<string, CaseEntity>;
}): string {
  void input.entitiesById;
  const { rows, currentPlanDocId, planContextPrefix } = input;
  const targetRow =
    rowFromPlanDoc(rows, "annual_goal_target", currentPlanDocId) ?? latestRow(rows, "annual_goal_target");
  const baselineRow = latestRow(rows, "baseline");
  const latestRowOrf = latestRow(rows, "oral_reading_fluency");

  const fields: Record<string, string> = {};
  const targetQ = qty(targetRow?.display);
  if (targetQ) {
    fields.target = formatQty(targetQ.n, targetQ.unit);
  }
  const baselineQ = qty(baselineRow?.display);
  if (baselineQ) {
    fields.baseline = formatQty(baselineQ.n, baselineQ.unit);
  }
  const latestQ = qty(latestRowOrf?.display);
  if (latestQ) {
    fields.latest = formatQty(latestQ.n, latestQ.unit);
  }

  const sentence = fillTemplate(
    "Target {target} by {targetDate}. Started at {baseline}. Latest: {latest}.",
    fields,
  );
  const cleaned = dropEmptyClauses(sentence);
  if (planContextPrefix && cleaned) {
    return `${planContextPrefix}: ${cleaned}`;
  }
  return cleaned || "Reading goal";
}

export function renderServicesOneLiner(rows: FactRow[]): string {
  const freq = latestRow(rows, "service_frequency");
  const length = latestRow(rows, "service_session_length");
  const setting = latestRow(rows, "service_setting");
  const fields: Record<string, string> = {};
  const fq = qty(freq?.display);
  if (fq) {
    fields.frequency = formatQty(fq.n, fq.unit);
  }
  const lq = qty(length?.display);
  if (lq) {
    fields.sessionLength = formatQty(lq.n, lq.unit);
  }
  if (setting?.display?.display?.trim()) {
    fields.setting = setting.display.display.trim();
  } else if (rows.some((r) => r.measure.includes("instruction"))) {
    fields.setting = "specialized reading instruction";
  }
  return (
    dropEmptyClauses(fillTemplate("{frequency}, {sessionLength} each, {setting}", fields)) ||
    "Services"
  );
}

export function renderAccommodationsOneLiner(rows: FactRow[]): string {
  const mult = latestRow(rows, "accommodation_time_multiplier");
  const fields: Record<string, string> = {};
  const mq = mult ? qty(mult.display) : null;
  if (mq) {
    fields.multiplier = formatQty(mq.n, mq.unit);
  }
  fields.accommodation = "Extended time";
  fields.scope = "tests";
  return (
    dropEmptyClauses(fillTemplate("{multiplier} {accommodation} on {scope}", fields)) || "Accommodations"
  );
}

export function renderEligibilityOneLiner(rows: FactRow[]): string {
  const category =
    latestRow(rows, "eligibility_category") ?? latestRow(rows, "special_education_eligibility");
  const need = latestRow(rows, "primary_educational_need");
  const fields: Record<string, string> = {};
  const cat =
    codeLabel(category?.display) ||
    (category?.display?.display?.trim() ? category.display.display.trim() : null);
  if (cat) {
    fields.category = cat;
  }
  const needLabel = codeLabel(need?.display) ?? need?.display?.display?.trim() ?? null;
  if (needLabel) {
    fields.primaryNeed = needLabel;
  }
  return (
    dropEmptyClauses(fillTemplate("{category}. Main area of need: {primaryNeed}.", fields)) ||
    "Eligibility"
  );
}

export function renderSectionOneLiner(
  sectionId: string,
  rows: FactRow[],
  input: {
    currentPlanDocId: string | null;
    planContextPrefix: string | null;
    entitiesById: Map<string, CaseEntity>;
  },
): string {
  switch (sectionId) {
    case "goals":
      return renderGoalsOneLiner({ rows, ...input });
    case "services":
      return renderServicesOneLiner(rows);
    case "accommodations":
      return renderAccommodationsOneLiner(rows);
    case "eligibility":
      return renderEligibilityOneLiner(rows);
    case "evaluation":
    case "dates":
      return rows
        .filter((r) => !CLIENT_PLAN_HIDDEN_MEASURE_ROOTS.has(constructRoot(r.measure)))
        .slice(0, 3)
        .map((r) => r.display?.display?.trim())
        .filter(Boolean)
        .join(". ");
    default:
      return rows
        .filter((r) => !CLIENT_PLAN_HIDDEN_MEASURE_ROOTS.has(constructRoot(r.measure)))
        .slice(0, 2)
        .map((r) => r.display?.display?.trim())
        .filter(Boolean)
        .join("; ");
  }
}

export function goalProgressStorySentence(rows: FactRow[]): string | null {
  const target = latestRow(rows, "annual_goal_target");
  const latest = latestRow(rows, "oral_reading_fluency");
  const baseline = latestRow(rows, "baseline");
  const tq = qty(target?.display);
  const lq = qty(latest?.display);
  const bq = qty(baseline?.display);
  if (!lq || !tq) {
    return null;
  }
  let text = `The progress report shows the fluency goal wasn't met: ${formatQty(lq.n, lq.unit)} against a target of ${tq.n}.`;
  if (bq) {
    text += ` It started at ${bq.n}.`;
  }
  return text;
}

export function goalTopQuestionSentence(rows: FactRow[], noGoalInCurrentPlan: boolean): string | null {
  if (noGoalInCurrentPlan) {
    return "What's the plan for this goal in the new IEP?";
  }
  const need = latestRow(rows, "primary_educational_need");
  const needLabel = codeLabel(need?.display);
  if (needLabel?.toLowerCase().includes("comprehension")) {
    return "Worth raising: what goal will track reading comprehension in the new IEP?";
  }
  return "What's the plan for this goal in the new IEP?";
}

export function eligibilityChangedStory(rows: FactRow[]): string | null {
  const needRows = rows.filter((r) => constructRoot(r.measure) === "primary_educational_need");
  const need =
    needRows.find((r) => !r.isPlanDoc) ??
    [...needRows].sort((a, b) => b.documentSortKey.localeCompare(a.documentSortKey))[0];
  const label = need ? codeLabel(need.display) : null;
  if (label?.toLowerCase().includes("comprehension")) {
    return "After the reevaluation, the main area of need is reading comprehension, not reading fluency.";
  }
  return null;
}
