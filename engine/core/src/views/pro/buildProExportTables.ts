import type { DomainPack } from "@hiveforyou/domain-pack";
import type { Study, StudySlotComparison } from "@hiveforyou/shared/pack-study";

import { chipLabel, docRoleLabelForSlot, documentDisplayTitle } from "./docRoleLabels";
import { formatStudyDisplayValue } from "./formatStudyDisplay";
import type { ProCaseDocument } from "./buildProViewBottom";
import { loadAnchorGuide, resolveProLabel } from "./resolveProLabel";
import type { ProSignal, ProViewModel } from "./proViewModel.types";

export type ProExportTables = Record<
  "documents" | "facts" | "comparisons" | "series_points" | "gaps" | "signals",
  Record<string, unknown>[]
>;

function cellText(
  pack: DomainPack,
  slot: string | null,
  study: Study,
): string {
  if (!slot) {
    return "";
  }
  return formatStudyDisplayValue(pack, slot, study.facts[slot]) ?? "";
}

function sourcesForSlot(study: Study, slot: string | null): string {
  if (!slot) {
    return "";
  }
  const fact = study.facts[slot];
  if (!fact) {
    return "";
  }
  const role = docRoleLabelForSlot(slot, study.anchors);
  const page = fact.page ?? 1;
  return chipLabel(role, page);
}

function comparisonRow(
  pack: DomainPack,
  comparison: StudySlotComparison,
  study: Study,
): Record<string, unknown> | null {
  const guide = loadAnchorGuide(pack);
  const label = resolveProLabel(pack, comparison.attributeId, guide, false);
  if (!label) {
    return null;
  }
  const section = guide?.sections.find((s) => s.id === comparison.sectionId);
  return {
    compareId: comparison.id,
    section: section?.docTitle ?? comparison.sectionId,
    attribute: comparison.attributeId,
    label,
    state: comparison.state,
    prior_display: cellText(pack, comparison.priorSlot, study),
    current_display: cellText(pack, comparison.currentSlot, study),
    prior_sources: sourcesForSlot(study, comparison.priorSlot),
    current_sources: sourcesForSlot(study, comparison.currentSlot),
    reason: comparison.note ?? "",
  };
}

export function buildProExportTables(input: {
  pack: DomainPack;
  study: Study;
  viewModel: ProViewModel;
  documents: ProCaseDocument[];
  quotesByFactId?: Record<string, string>;
  documentFactStats?: Record<string, { count: number; pages: number[] }>;
}): ProExportTables {
  const { pack, study, viewModel, documents, quotesByFactId = {}, documentFactStats = {} } = input;
  const guide = loadAnchorGuide(pack);

  const documentsRows = documents.map((doc) => {
    const stats = documentFactStats[doc.sourceDocumentId];
    const role = documentDisplayTitle(doc.fileName, doc.documentType);
    return {
      docId: doc.sourceDocumentId,
      doc_role: role,
      file: doc.fileName,
      docType: doc.documentType,
      role,
      date: doc.documentDate ?? "",
      pages: stats?.pages.length ?? 0,
      factsExtracted: stats?.count ?? 0,
    };
  });

  const factsRows: Record<string, unknown>[] = [];
  for (const [attribute, fact] of Object.entries(study.facts)) {
    const label = resolveProLabel(pack, attribute, guide, false) ?? attribute;
    const display = formatStudyDisplayValue(pack, attribute, fact);
    if (!display) {
      continue;
    }
    const doc = documents.find(
      (d) => d.logicalDocumentId === fact.doc || d.sourceDocumentId === fact.doc,
    );
    const docRole = doc
      ? documentDisplayTitle(doc.fileName, doc.documentType)
      : docRoleLabelForSlot(attribute, study.anchors);
    factsRows.push({
      factId: fact.id,
      attribute,
      label,
      raw_value: fact.raw,
      unit: "",
      display,
      asOf: fact.date ?? "",
      docId: doc?.sourceDocumentId ?? fact.doc ?? "",
      doc_role: docRole,
      page: fact.page ?? 1,
      quote: quotesByFactId[fact.id] ?? display,
    });
  }

  const comparisonsRows = study.slotComparisons
    .map((c) => comparisonRow(pack, c, study))
    .filter(Boolean) as Record<string, unknown>[];

  const seriesRows: Record<string, unknown>[] = [];
  study.measureSeries.forEach((series, seriesIndex) => {
    const label = series.measure;
    const goalTarget = series.target?.value ?? "";
    for (const pt of series.points) {
      const fact = Object.values(study.facts).find((f) => f.id === pt.factId);
      const slot = fact ? "series.point" : "prior.goal.measure";
      seriesRows.push({
        seriesId: `measure-${seriesIndex}`,
        label,
        asOf: pt.date,
        reading: pt.value,
        unit: series.unit,
        doc_role: fact
          ? docRoleLabelForSlot(slot, study.anchors)
          : "Progress report",
        page: fact?.page ?? 1,
        factId: pt.factId,
        goal_target: goalTarget,
      });
    }
  });

  const gapsRows = study.recordGaps.map((gap, index) => ({
    gapId: `gap-${index}`,
    kind: "record-gap",
    label: gap.missing,
    from_date: gap.from,
    to_date: gap.to,
    months: gap.months ?? 0,
    doc_role: "Record search",
  }));

  const signalsRows = viewModel.signals.map((signal: ProSignal) => ({
    signalId: `signal-${signal.rank}`,
    rank: signal.rank,
    kind: signal.state,
    title: signal.title,
    detail: signal.detail,
    question: signal.question ?? "",
    factIds: signal.chips.map((c) => c.factId).filter(Boolean).join(","),
  }));

  return {
    documents: documentsRows,
    facts: factsRows,
    comparisons: comparisonsRows,
    series_points: seriesRows,
    gaps: gapsRows,
    signals: signalsRows,
  };
}
