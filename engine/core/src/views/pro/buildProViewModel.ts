import type { DomainPack } from "@hiveforyou/domain-pack";
import type { DocumentGuide, GuideSection } from "@hiveforyou/domain-pack-shared/rulebook/schema";
import type {
  Study,
  StudyFact,
  StudyRankedSignal,
  StudyRowState,
  StudySlotComparison,
} from "@hiveforyou/shared/pack-study";

import { chipLabel, docRoleLabelForSlot } from "./docRoleLabels";
import { firstGuideQuestion } from "./evaluateGuideQuestion";
import { formatStudyDisplayValue } from "./formatStudyDisplay";
import type {
  ProCell,
  ProChip,
  ProGroup,
  ProHeader,
  ProRow,
  ProRowState,
  ProSignal,
  ProViewModel,
} from "./proViewModel.types";
import {
  buildCoverage,
  buildLedgerRows,
  buildMeasureSeriesViews,
  buildReevalRows,
  buildTimeline,
  type DocumentFactStats,
  type ProCaseDocument,
} from "./buildProViewBottom";
import { loadAnchorGuide, resolveProLabel } from "./resolveProLabel";

export class HeaderSlotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HeaderSlotValidationError";
  }
}

const DEV = process.env.NODE_ENV !== "production";

function mapRowState(state: StudyRowState): ProRowState {
  return state;
}

function factChip(
  pack: DomainPack,
  slot: string | null,
  fact: StudyFact | null | undefined,
  study: Study,
): ProChip | null {
  if (!slot || !fact) {
    return null;
  }
  const text = formatStudyDisplayValue(pack, slot, fact);
  if (!text) {
    return null;
  }
  const role = docRoleLabelForSlot(slot, study.anchors);
  const page = fact.page ?? 1;
  return {
    label: chipLabel(role, page),
    docId: fact.doc ?? slot,
    page,
    factId: fact.id,
  };
}

function cellFromSlot(
  pack: DomainPack,
  slot: string | null,
  study: Study,
): ProCell {
  if (!slot) {
    return { empty: "not-in-document" };
  }
  const fact = study.facts[slot];
  const text = formatStudyDisplayValue(pack, slot, fact);
  const chip = factChip(pack, slot, fact, study);
  if (!text || !chip) {
    return { empty: "not-captured" };
  }
  return { values: [{ text, chip }] };
}

function comparisonToRow(
  pack: DomainPack,
  comparison: StudySlotComparison,
  guide: DocumentGuide | null,
  study: Study,
): ProRow | null {
  const label = resolveProLabel(pack, comparison.attributeId, guide, DEV);
  if (!label) {
    return null;
  }
  return {
    id: comparison.id,
    label,
    prior: cellFromSlot(pack, comparison.priorSlot, study),
    current: cellFromSlot(pack, comparison.currentSlot, study),
    state: mapRowState(comparison.state),
    note: comparison.note,
  };
}

function headerSlotFactKeys(slot: string): string[] {
  if (slot === "plan.period") {
    return ["plan.period", "current.plan.period", "prior.plan.period"];
  }
  if (slot === "eligibility.category") {
    return ["current.eligibility.category", "prior.eligibility.category", "eligibility.category"];
  }
  if (slot === "school.name") {
    return ["current.school.name", "school.name", "prior.school.name"];
  }
  if (slot.startsWith("prior.") || slot.startsWith("current.")) {
    return [slot];
  }
  return [`current.${slot}`, slot, `prior.${slot}`];
}

function headerFacts(pack: DomainPack, guide: DocumentGuide, study: Study): ProHeader["facts"] {
  const slots = guide.headerSlots ?? [];
  const out: ProHeader["facts"] = [];
  for (const slot of slots) {
    const keys = headerSlotFactKeys(slot);
    const fact = keys.map((k) => study.facts[k]).find(Boolean);
    const booleanish = fact?.raw === "true" || fact?.raw === "false";
    if (booleanish && DEV) {
      throw new HeaderSlotValidationError(`Header slot "${slot}" resolves to a boolean`);
    }
    const text = formatStudyDisplayValue(pack, slot, fact);
    if (!text) {
      continue;
    }
    let label = resolveProLabel(pack, slot, guide, false);
    if (!label) {
      label = slot
        .split(".")
        .pop()!
        .replace(/_/g, " ");
    }
    out.push({ label, text });
  }
  return out;
}

function buildHeader(
  pack: DomainPack,
  guide: DocumentGuide,
  study: Study,
  options: BuildProViewModelOptions,
): ProHeader {
  const first = study.facts["student.firstName"]?.display ?? "Student";
  const last = study.facts["student.lastName"]?.display?.trim();
  const caseType = options.caseTypeLabel ?? "IEP meeting";
  const title = last ? `${first} ${last} · ${caseType}` : `${first} · ${caseType}`;
  const recordSpan =
    options.recordSpan ??
    (study.anchors.prior?.date && study.anchors.current?.date
      ? `${study.anchors.prior.date.slice(0, 7)} – ${study.anchors.current.date.slice(0, 7)}`
      : "");
  return {
    title,
    facts: headerFacts(pack, guide, study),
    documentCount: options.documentCount ?? 0,
    recordSpan,
  };
}

function sectionById(guide: DocumentGuide, id: string): GuideSection | undefined {
  return guide.sections.find((s) => s.id === id);
}

function buildGroups(
  pack: DomainPack,
  guide: DocumentGuide,
  study: Study,
): ProGroup[] {
  const comparisonsBySection = new Map<string, StudySlotComparison[]>();
  for (const row of study.slotComparisons) {
    const list = comparisonsBySection.get(row.sectionId) ?? [];
    list.push(row);
    comparisonsBySection.set(row.sectionId, list);
  }

  return guide.sections.map((section) => {
    const comparisons = comparisonsBySection.get(section.id) ?? [];
    const rows: ProRow[] = [];
    for (const comparison of comparisons) {
      const row = comparisonToRow(pack, comparison, guide, study);
      if (row) {
        rows.push(row);
      }
    }
    if (rows.length === 0) {
      rows.push({
        id: `${section.id}:empty`,
        label: section.docTitle,
        prior: { empty: "not-captured" },
        current: { empty: "not-captured" },
        state: "notcompared",
      });
    }
    return { sectionId: section.id, title: section.docTitle, rows };
  });
}

function signalDetailForComparison(
  pack: DomainPack,
  comparison: StudySlotComparison,
  study: Study,
): string {
  const priorText = comparison.priorSlot
    ? formatStudyDisplayValue(pack, comparison.priorSlot, study.facts[comparison.priorSlot])
    : null;
  const currentText = comparison.currentSlot
    ? formatStudyDisplayValue(pack, comparison.currentSlot, study.facts[comparison.currentSlot])
    : null;
  if (comparison.state === "changed" && priorText && currentText) {
    return `${priorText} → ${currentText}`;
  }
  if (comparison.state === "dropped" && priorText) {
    if (comparison.note) {
      return comparison.note;
    }
    return `Last marked not met; not in the new plan`;
  }
  if (comparison.state === "added" && currentText) {
    return `Added: ${currentText}`;
  }
  if (comparison.state === "reconfirmed" && priorText) {
    return priorText;
  }
  return comparison.note ?? "";
}

function chipsForComparison(
  pack: DomainPack,
  comparison: StudySlotComparison,
  study: Study,
): ProChip[] {
  const chips: ProChip[] = [];
  for (const slot of [comparison.priorSlot, comparison.currentSlot]) {
    if (!slot) {
      continue;
    }
    const chip = factChip(pack, slot, study.facts[slot], study);
    if (chip) {
      chips.push(chip);
    }
  }
  return chips;
}

function buildSignals(
  pack: DomainPack,
  guide: DocumentGuide,
  study: Study,
): ProSignal[] {
  const byId = new Map(study.slotComparisons.map((c) => [c.id, c]));
  const signals: ProSignal[] = [];
  let rank = 0;

  for (const entry of study.rankedSignals.slice(0, 3)) {
    if (entry.kind === "gap") {
      const gap = study.recordGaps[entry.gapIndex];
      if (!gap) {
        continue;
      }
      rank += 1;
      signals.push({
        rank,
        state: "gap",
        title: "Record gap",
        detail: `${gap.from} – ${gap.to} (${gap.missing})`,
        chips: [
          {
            label: chipLabel("Record search", 1),
            docId: gap.factId,
            page: 1,
            factId: gap.factId,
          },
        ],
        question: firstGuideQuestion(sectionById(guide, "progress"), "gap"),
      });
      continue;
    }

    const comparison = byId.get(entry.comparisonId);
    if (!comparison) {
      continue;
    }
    const label = resolveProLabel(pack, comparison.attributeId, guide, DEV);
    if (!label) {
      continue;
    }
    rank += 1;
    const section = sectionById(guide, comparison.sectionId);
    signals.push({
      rank,
      state: mapRowState(comparison.state),
      title: label,
      detail: signalDetailForComparison(pack, comparison, study),
      chips: chipsForComparison(pack, comparison, study),
      question: firstGuideQuestion(section, comparison.state),
    });
  }

  return signals;
}

export type BuildProViewModelOptions = {
  documentCount?: number;
  caseTypeLabel?: string;
  recordSpan?: string;
  documents?: ProCaseDocument[];
  documentFactStats?: Record<string, DocumentFactStats>;
  quotesByFactId?: Record<string, string>;
};

function bottomSections(pack: DomainPack, study: Study, options: BuildProViewModelOptions) {
  const documents = options.documents ?? [];
  return {
    measureSeries: buildMeasureSeriesViews(pack, study, documents),
    reevalRows: buildReevalRows(pack, study, documents),
    timeline: documents.length ? buildTimeline(study, documents, options.documentFactStats) : [],
    coverage: documents.length ? buildCoverage(study, documents, options.documentFactStats) : [],
    ledger: buildLedgerRows(pack, study, documents, options.quotesByFactId ?? {}),
  };
}

export function buildProViewModel(
  pack: DomainPack,
  study: Study,
  options: BuildProViewModelOptions = {},
): ProViewModel {
  const guide = loadAnchorGuide(pack);
  if (!guide) {
    return {
      header: {
        title: study.facts["student.firstName"]?.display ?? "Case",
        facts: [],
        documentCount: options.documentCount ?? 0,
        recordSpan: options.recordSpan ?? "",
      },
      signals: [],
      groups: [],
      ...bottomSections(pack, study, options),
    };
  }

  return {
    header: buildHeader(pack, guide, study, options),
    signals: buildSignals(pack, guide, study),
    groups: buildGroups(pack, guide, study),
    ...bottomSections(pack, study, options),
  };
}

export type { DocumentFactStats, ProCaseDocument } from "./buildProViewBottom";

export function resolveRankedSignalComparison(
  signal: StudyRankedSignal,
  study: Study,
): StudySlotComparison | null {
  if (signal.kind === "gap") {
    return null;
  }
  return study.slotComparisons.find((c) => c.id === signal.comparisonId) ?? null;
}
