import type { DomainPack } from "@hiveforyou/domain-pack";
import type { Study, StudyFact } from "@hiveforyou/shared/pack-study";

import { chipLabel, docRoleLabelForSlot, documentDisplayTitle } from "./docRoleLabels";
import { formatStudyDisplayValue } from "./formatStudyDisplay";
import type {
  ProChip,
  ProCoverageRow,
  ProDetailRow,
  ProLedgerRow,
  ProMeasurePoint,
  ProMeasureSeriesView,
  ProTimelineEntry,
  ProTimelineGap,
} from "./proViewModel.types";
import { loadAnchorGuide, resolveProLabel } from "./resolveProLabel";

export type ProCaseDocument = {
  sourceDocumentId: string;
  logicalDocumentId: string;
  fileName: string;
  documentType: string;
  documentDate: string | null;
};

const ENTITY_ID = /^entity_|_/i;
const SKIP_VALUE = /^(yes|no)$/i;

function factById(study: Study, factId: string): StudyFact | undefined {
  return Object.values(study.facts).find((f) => f.id === factId);
}

function findDocument(documents: ProCaseDocument[], fact: StudyFact): ProCaseDocument | undefined {
  if (!fact.doc) {
    return undefined;
  }
  return documents.find(
    (d) => d.logicalDocumentId === fact.doc || d.sourceDocumentId === fact.doc || d.fileName === fact.doc,
  );
}

function chipForFact(
  study: Study,
  slot: string,
  fact: StudyFact,
  documents: ProCaseDocument[] = [],
): ProChip {
  const page = fact.page ?? 1;
  const doc = findDocument(documents, fact);
  const role = doc
    ? documentDisplayTitle(doc.fileName, doc.documentType)
    : docRoleLabelForSlot(slot, study.anchors);
  return {
    label: chipLabel(role, page),
    docId: doc?.sourceDocumentId ?? fact.doc ?? fact.id,
    page,
    factId: fact.id,
  };
}

function chipForDocument(doc: ProCaseDocument, factId?: string, page = 1): ProChip {
  const title = documentDisplayTitle(doc.fileName, doc.documentType);
  return {
    label: chipLabel(title, page),
    docId: doc.sourceDocumentId,
    page,
    factId,
  };
}

function monthYear(iso: string): string {
  if (!/^\d{4}-\d{2}/.test(iso)) {
    return iso;
  }
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatMeasureValue(value: string, unit: string | null): string {
  const v = value.trim();
  if (!unit) {
    return v;
  }
  if (unit.toLowerCase() === "grade" && /^\d+$/.test(v)) {
    const n = Number.parseInt(v, 10);
    const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
    return `${n}${suffix} grade`;
  }
  if (v.toLowerCase().includes(unit.toLowerCase())) {
    return v;
  }
  return `${v} ${unit}`.replace(/\s+grade\s+grade/gi, " grade");
}

export function buildMeasureSeriesViews(
  pack: DomainPack,
  study: Study,
  documents: ProCaseDocument[] = [],
): ProMeasureSeriesView[] {
  if (!study.measureSeries.length) {
    return [];
  }
  return study.measureSeries.map((series, index) => {
    const points: ProMeasurePoint[] = series.points.map((pt) => {
      const fact = factById(study, pt.factId);
      const slot = fact ? "series.point" : "prior.goal.measure";
      return {
        dateLabel: pt.date,
        valueText: formatMeasureValue(pt.value, series.unit),
        chip: fact ? chipForFact(study, slot, fact, documents) : {
          label: chipLabel("Progress report", 1),
          docId: pt.factId,
          page: 1,
          factId: pt.factId,
        },
      };
    });
    const pointChips = points.map((p) => p.chip);
    let goalChip: ProChip | null = null;
    let goalTarget: string | null = null;
    if (series.target) {
      goalTarget = series.target.value;
      const targetFact = factById(study, series.target.factId);
      if (targetFact) {
        goalChip = chipForFact(study, "prior.goal.target", targetFact, documents);
      }
    }
    const title =
      series.measure.toLowerCase().includes("fluency") || series.unit === "WCPM"
        ? "Oral reading fluency"
        : series.measure.replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      id: `measure-${index}`,
      title,
      unit: pack.story.units[series.unit] ?? series.unit,
      goalTarget,
      goalChip,
      points,
      pointChips,
      warning:
        points.length >= 2
          ? "Scores share a unit but may not be the same measure unless the test form is confirmed in each source."
          : null,
    };
  });
}

const REEVAL_ROW_LABELS: Record<string, string> = {
  "reeval.latest.date": "Latest reevaluation date",
  "reeval.latest.season": "Reevaluation season",
};

export function buildReevalRows(
  pack: DomainPack,
  study: Study,
  documents: ProCaseDocument[] = [],
): ProDetailRow[] {
  const rows: ProDetailRow[] = [];
  for (const clause of study.reevalMeasures) {
    const anchorFact = clause.factIds.map((id) => factById(study, id)).find(Boolean);
    rows.push({
      id: `reeval-clause-${rows.length}`,
      label: "Reevaluation summary",
      valueText: clause.text,
      chip: anchorFact
        ? chipForFact(study, "reeval.summary", anchorFact, documents)
        : {
            label: chipLabel(
              documents.find((d) => /eval/i.test(d.fileName))?.documentType
                ? documentDisplayTitle(
                    documents.find((d) => /eval/i.test(d.fileName))!.fileName,
                    documents.find((d) => /eval/i.test(d.fileName))!.documentType,
                  )
                : "Reevaluation report",
              1,
            ),
            docId: clause.factIds[0] ?? "reeval",
            page: 1,
          },
    });
  }
  for (const [slot, label] of Object.entries(REEVAL_ROW_LABELS)) {
    const fact = study.facts[slot];
    if (!fact) {
      continue;
    }
    const text = formatStudyDisplayValue(pack, slot, fact);
    if (!text || ENTITY_ID.test(text) || SKIP_VALUE.test(text)) {
      continue;
    }
    rows.push({
      id: slot,
      label,
      valueText: text,
      chip: chipForFact(study, slot, fact, documents),
    });
  }
  return rows.slice(0, 8);
}

export type DocumentFactStats = {
  count: number;
  pages: number[];
  firstClaimId?: string;
};

function factsByDocument(study: Study): Map<string, { count: number; pages: Set<number>; firstFactId?: string }> {
  const map = new Map<string, { count: number; pages: Set<number>; firstFactId?: string }>();
  for (const [slot, fact] of Object.entries(study.facts)) {
    const docKey = fact.doc ?? slot;
    const row = map.get(docKey) ?? { count: 0, pages: new Set<number>() };
    row.count += 1;
    if (fact.page) {
      row.pages.add(fact.page);
    }
    row.firstFactId ??= fact.id;
    map.set(docKey, row);
  }
  return map;
}

function resolveDocStats(
  doc: ProCaseDocument,
  study: Study,
  factsByDoc: Map<string, { count: number; pages: Set<number>; firstFactId?: string }>,
  documentFactStats?: Record<string, DocumentFactStats>,
) {
  const fromCase = documentFactStats?.[doc.sourceDocumentId];
  if (fromCase) {
    return {
      count: fromCase.count,
      pages: new Set(fromCase.pages),
      firstFactId: fromCase.firstClaimId,
    };
  }
  return (
    factsByDoc.get(doc.logicalDocumentId) ??
    factsByDoc.get(doc.sourceDocumentId) ??
    { count: 0, pages: new Set<number>(), firstFactId: undefined }
  );
}

function gapBeforeEntry(
  date: string | null,
  prevDate: string | null,
  study: Study,
): ProTimelineGap | null {
  if (!date || !prevDate) {
    return null;
  }
  const months = Math.round((Date.parse(date) - Date.parse(prevDate)) / 2.628e9);
  if (months <= 13) {
    return null;
  }
  const fromRecord = study.recordGaps.find((g) => g.from && g.to);
  if (fromRecord) {
    return { months: fromRecord.months ?? months, fromLabel: fromRecord.from, toLabel: fromRecord.to };
  }
  return { months, fromLabel: monthYear(prevDate), toLabel: monthYear(date) };
}

export function buildTimeline(
  study: Study,
  documents: ProCaseDocument[],
  documentFactStats?: Record<string, DocumentFactStats>,
): ProTimelineEntry[] {
  const factsByDoc = factsByDocument(study);
  const sorted = [...documents].sort((a, b) => {
    const ad = a.documentDate ?? (a.fileName.match(/^\d+/) ? "9999" : "0000");
    const bd = b.documentDate ?? (b.fileName.match(/^\d+/) ? "9999" : "0000");
    return ad.localeCompare(bd);
  });
  let prevDated: string | null = null;
  const entries: ProTimelineEntry[] = [];
  for (const doc of sorted) {
    const stats = resolveDocStats(doc, study, factsByDoc, documentFactStats);
    const date = doc.documentDate?.slice(0, 10) ?? null;
    const gapBefore = date && prevDated ? gapBeforeEntry(date, prevDated, study) : null;
    if (date) {
      prevDated = date;
    }
    const page = stats.pages.size ? Math.min(...stats.pages) : 1;
    entries.push({
      docId: doc.sourceDocumentId,
      title: documentDisplayTitle(doc.fileName, doc.documentType),
      date,
      undated: !date,
      factCount: stats.count,
      chip: chipForDocument(doc, stats.firstFactId, page),
      gapBefore,
    });
  }
  return entries;
}

export function buildLedgerRows(
  pack: DomainPack,
  study: Study,
  documents: ProCaseDocument[] = [],
  quotesByFactId: Record<string, string> = {},
): ProLedgerRow[] {
  const guide = loadAnchorGuide(pack);
  const rows: ProLedgerRow[] = [];
  for (const [attribute, fact] of Object.entries(study.facts)) {
    const label = resolveProLabel(pack, attribute, guide, false);
    if (!label) {
      continue;
    }
    const valueText = formatStudyDisplayValue(pack, attribute, fact);
    if (!valueText || ENTITY_ID.test(valueText) || SKIP_VALUE.test(valueText)) {
      continue;
    }
    rows.push({
      factId: fact.id,
      dateLabel: fact.date ? monthYear(fact.date) : "—",
      label,
      valueText,
      quote: quotesByFactId[fact.id] ?? valueText,
      chip: chipForFact(study, attribute, fact, documents),
    });
  }
  rows.sort((a, b) => {
    const d = a.dateLabel.localeCompare(b.dateLabel);
    if (d !== 0) {
      return d;
    }
    return (a.chip.page ?? 0) - (b.chip.page ?? 0);
  });
  return rows;
}

export function buildCoverage(
  study: Study,
  documents: ProCaseDocument[],
  documentFactStats?: Record<string, DocumentFactStats>,
): ProCoverageRow[] {
  const factsByDoc = factsByDocument(study);
  return documents.map((doc) => {
    const stats = resolveDocStats(doc, study, factsByDoc, documentFactStats);
    const page = stats.pages.size ? Math.min(...stats.pages) : 1;
    let status: ProCoverageRow["status"] = "ok";
    let statusLabel = "OK";
    if (stats.count === 0) {
      status = "empty";
      statusLabel = "No facts read — check this file";
    } else if (!doc.documentDate) {
      status = "undated";
      statusLabel = "Undated";
    } else if (stats.count < 2) {
      status = "partial";
      statusLabel = "Partial capture — review source";
    }
    return {
      docId: doc.sourceDocumentId,
      title: documentDisplayTitle(doc.fileName, doc.documentType),
      chip: chipForDocument(doc, stats.firstFactId, page),
      pages: [...stats.pages].sort((a, b) => a - b),
      factCount: stats.count,
      status,
      statusLabel,
    };
  });
}
