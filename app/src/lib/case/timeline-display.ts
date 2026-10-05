import type {
  CaseDocument,
  CaseItemV2,
  CaseTimeline,
  CaseViewV2,
  Chip,
} from "@hiveforyou/shared/projections";
import { CASE_VIEW_V2_SCHEMA, constructRoot } from "@hiveforyou/shared/projections";

import type { ProvenanceIndex } from "@/lib/case/provenance-index";
import { claimIdsForItemId } from "@/lib/case-summary/claim-ids-for-case-item";

export type TimelineFactTag = "changed" | "new" | "dropped" | "same" | "notmet";

export type TimelineFactLine = {
  text: string;
  tag?: TimelineFactTag;
  page?: number;
  claimId?: string;
};

export type TimelineDocEntry = {
  kind: "document";
  date: string;
  title: string;
  subtitle?: string;
  docLabel: string;
  logicalDocumentId: string;
  plan?: boolean;
  change?: boolean;
  keyFacts: TimelineFactLine[];
  allFacts: Array<{ label: string; value: string }>;
  pages: number[];
  claimIds: string[];
};

export type TimelineGapEntry = {
  kind: "gap";
  from: string;
  to: string;
  months: number;
};

export type TimelineDisplayEntry = TimelineDocEntry | TimelineGapEntry;

export type FluencyChartPoint = {
  date: string;
  label: string;
  value: number;
};

export type FluencyChartModel = {
  measureLabel: string;
  points: FluencyChartPoint[];
  targetValue: number | null;
  targetLabel: string | null;
  gapStartIndex: number | null;
  gapEndIndex: number | null;
  caveat: string;
};

function chipsForItem(item: CaseItemV2): Chip[] {
  if (item.state === "changed") {
    return item.series.flatMap((p) => p.chips);
  }
  if (item.state === "conflicting") {
    return item.sides.flatMap((s) => s.chips);
  }
  if ("chips" in item && Array.isArray(item.chips)) {
    return item.chips;
  }
  return [];
}

function itemOnDocument(item: CaseItemV2, doc: CaseDocument): boolean {
  return chipsForItem(item).some(
    (c) =>
      (c.logicalDocumentId && c.logicalDocumentId === doc.logicalDocumentId) ||
      c.fileName === doc.fileName,
  );
}

function isPlanDocument(doc: CaseDocument): boolean {
  const hay = `${doc.documentType} ${doc.fileName}`.toLowerCase();
  return hay.includes("iep") && !hay.includes("progress") && !hay.includes("report");
}

function docShortLabel(doc: CaseDocument): string {
  const raw = doc.fileName.replace(/\.pdf$/i, "").replace(/^\d+\s+/, "").trim();
  if (raw.length <= 32) {
    return raw;
  }
  return `${raw.slice(0, 29)}…`;
}

function formatDisplayDate(iso: string): string {
  const trimmed = iso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return iso;
  }
  const d = new Date(`${trimmed}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return trimmed;
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMonthYear(iso: string): string {
  const trimmed = iso.trim().slice(0, 10);
  const d = new Date(`${trimmed}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return trimmed;
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function monthsBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso.slice(0, 10)}T12:00:00Z`);
  const end = new Date(`${endIso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth())
  );
}

function titleForDocument(doc: CaseDocument): string {
  const hay = `${doc.documentType} ${doc.fileName}`.toLowerCase();
  const year = doc.documentDate?.slice(0, 4);
  if (isPlanDocument(doc) && year) {
    return `${year} IEP begins`;
  }
  if (hay.includes("progress")) {
    return "Progress report";
  }
  if (hay.includes("psycho")) {
    return "Psychoeducational evaluation";
  }
  if (hay.includes("academic") && hay.includes("eval")) {
    return "Academic evaluation";
  }
  if (hay.includes("speech")) {
    return "Speech-language review";
  }
  if (hay.includes("reeval") && hay.includes("plan")) {
    return "Reevaluation planned";
  }
  if (hay.includes("eligib")) {
    return "Eligibility determination";
  }
  const base = doc.documentType.trim() || docShortLabel(doc);
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function statusToTag(status: string | null | undefined): TimelineFactTag | undefined {
  if (status === "changed") {
    return "changed";
  }
  if (status === "missing") {
    return "dropped";
  }
  if (status === "checked") {
    return "same";
  }
  return undefined;
}

function valueText(item: CaseItemV2): string | null {
  if (item.state === "established") {
    return item.value.display?.trim() || null;
  }
  if (item.state === "changed" && item.series.length) {
    const last = item.series[item.series.length - 1]!;
    return last.value.display?.trim() || null;
  }
  return null;
}

function documentIdForTimelineEvent(
  ev: CaseTimeline["events"][number],
  caseView: CaseViewV2,
  provenance: ProvenanceIndex | null,
): string | null {
  for (const itemId of ev.itemIds) {
    for (const claimId of claimIdsForItemId(caseView, itemId)) {
      const refs = provenance?.byClaimId.get(claimId);
      const id = refs?.[0]?.logicalDocumentId;
      if (id) {
        return id;
      }
      const chipDoc = caseView.items
        .flatMap((i) => chipsForItem(i))
        .find((c) => c.evidenceId === claimId);
      if (chipDoc?.logicalDocumentId) {
        return chipDoc.logicalDocumentId;
      }
    }
  }
  return null;
}

function mergeDocEntriesWithGaps(
  docs: CaseDocument[],
  docEntries: TimelineDocEntry[],
): TimelineDisplayEntry[] {
  const dated = docs.filter((d) => d.documentDate?.trim());
  const byId = new Map(docEntries.map((e) => [e.logicalDocumentId, e]));
  const out: TimelineDisplayEntry[] = [];
  for (let i = 0; i < dated.length; i++) {
    const doc = dated[i]!;
    if (i > 0) {
      const prev = dated[i - 1]!;
      const months = monthsBetween(prev.documentDate!, doc.documentDate!);
      if (months >= 13) {
        out.push({
          kind: "gap",
          from: formatMonthYear(prev.documentDate!),
          to: formatMonthYear(doc.documentDate!),
          months,
        });
      }
    }
    const entry = byId.get(doc.logicalDocumentId);
    if (entry) {
      out.push(entry);
    }
  }
  return out;
}

function isWcpmUnit(unit: string | null | undefined): boolean {
  if (!unit?.trim()) {
    return false;
  }
  return /^(wcpm|words per minute)$/i.test(unit.trim());
}

function itemMeasureRoot(item: CaseItemV2): string | null {
  if (item.state === "established" || item.state === "changed") {
    return constructRoot(item.construct.measure);
  }
  return null;
}

function isOralReadingFluencyObservation(item: CaseItemV2): boolean {
  return itemMeasureRoot(item) === "oral_reading_fluency";
}

function anchorDateForFluencyPoint(input: {
  occurredOn: string | null | undefined;
  anchorDate: string | null | undefined;
  chips: Chip[];
  documents: CaseDocument[];
}): string {
  const fromOccurred = input.occurredOn?.trim().slice(0, 10);
  if (fromOccurred && /^\d{4}-\d{2}-\d{2}$/.test(fromOccurred)) {
    return fromOccurred;
  }
  const fromAnchor = input.anchorDate?.trim().slice(0, 10);
  if (fromAnchor && /^\d{4}-\d{2}-\d{2}$/.test(fromAnchor)) {
    return fromAnchor;
  }
  const chip = input.chips[0];
  if (chip?.logicalDocumentId) {
    const doc = input.documents.find((d) => d.logicalDocumentId === chip.logicalDocumentId);
    const docDate = doc?.documentDate?.trim().slice(0, 10);
    if (docDate && /^\d{4}-\d{2}-\d{2}$/.test(docDate)) {
      return docDate;
    }
  }
  return "";
}

function pickFluencyGoalTarget(items: CaseItemV2[]): number | null {
  let target: number | null = null;
  let latestAnchor = "";

  for (const item of items) {
    if (itemMeasureRoot(item) !== "annual_goal_target") {
      continue;
    }
    if (item.state === "established" && item.value.numberValue != null && isWcpmUnit(item.value.unit)) {
      const date = anchorDateForFluencyPoint({
        occurredOn: item.occurredOn,
        anchorDate: null,
        chips: item.chips,
        documents: [],
      });
      if (date >= latestAnchor) {
        latestAnchor = date;
        target = item.value.numberValue;
      }
    }
    if (item.state === "changed") {
      for (const point of item.series) {
        if (point.value.numberValue == null || !isWcpmUnit(point.value.unit)) {
          continue;
        }
        const date = anchorDateForFluencyPoint({
          occurredOn: null,
          anchorDate: point.anchorDate,
          chips: point.chips,
          documents: [],
        });
        if (date >= latestAnchor) {
          latestAnchor = date;
          target = point.value.numberValue;
        }
      }
    }
  }

  return target;
}

export function buildFluencyChart(caseView: CaseViewV2): FluencyChartModel | null {
  const points: FluencyChartPoint[] = [];

  for (const item of caseView.items) {
    if (!isOralReadingFluencyObservation(item)) {
      continue;
    }
    if (item.state === "established" && item.value.numberValue != null && isWcpmUnit(item.value.unit)) {
      const date = anchorDateForFluencyPoint({
        occurredOn: item.occurredOn,
        anchorDate: null,
        chips: item.chips,
        documents: caseView.documents,
      });
      if (date) {
        points.push({
          date,
          label: formatMonthYear(date),
          value: item.value.numberValue,
        });
      }
    }
    if (item.state === "changed") {
      for (const p of item.series) {
        if (p.value.numberValue != null && isWcpmUnit(p.value.unit) && p.anchorDate) {
          const date = anchorDateForFluencyPoint({
            occurredOn: null,
            anchorDate: p.anchorDate,
            chips: p.chips,
            documents: caseView.documents,
          });
          if (date) {
            points.push({
              date,
              label: formatMonthYear(date),
              value: p.value.numberValue,
            });
          }
        }
      }
    }
  }

  const target = pickFluencyGoalTarget(caseView.items);

  points.sort((a, b) => a.date.localeCompare(b.date));
  const deduped: FluencyChartPoint[] = [];
  for (const p of points) {
    if (deduped.at(-1)?.date === p.date && deduped.at(-1)?.value === p.value) {
      continue;
    }
    deduped.push(p);
  }
  if (deduped.length < 2) {
    return null;
  }

  return {
    measureLabel: "Reading fluency across the timeline",
    points: deduped,
    targetValue: target,
    targetLabel: target != null ? `Goal: ${target}` : null,
    gapStartIndex: null,
    gapEndIndex: null,
    caveat:
      "Words correct per minute. Points come from validated claims; different probes may not be directly comparable.",
  };
}

export function buildTimelineDisplay(input: {
  caseView: CaseViewV2 | null;
  timeline: CaseTimeline;
  provenance: ProvenanceIndex | null;
}): { entries: TimelineDisplayEntry[]; fluency: FluencyChartModel | null } {
  if (!input.caseView || input.caseView.schemaVersion !== CASE_VIEW_V2_SCHEMA) {
    return { entries: [], fluency: null };
  }
  const caseView = input.caseView;
  const docs = [...caseView.documents]
    .filter((d) => d.documentDate?.trim())
    .sort((a, b) => (a.documentDate ?? "").localeCompare(b.documentDate ?? ""));

  const eventsByDoc = new Map<string, CaseTimeline["events"]>();
  for (const ev of input.timeline.events) {
    const docId =
      documentIdForTimelineEvent(ev, caseView, input.provenance) ??
      docs.find((d) => d.documentDate?.slice(0, 10) === ev.date?.value)?.logicalDocumentId;
    if (!docId) {
      continue;
    }
    const list = eventsByDoc.get(docId) ?? [];
    list.push(ev);
    eventsByDoc.set(docId, list);
  }

  const docEntries: TimelineDocEntry[] = docs.map((doc) => {
    const date = doc.documentDate!.slice(0, 10);
    const docItems = caseView.items.filter((i) => itemOnDocument(i, doc));
    const linkedEvents = eventsByDoc.get(doc.logicalDocumentId) ?? [];

    const keyFacts: TimelineFactLine[] = [];
    for (const ev of linkedEvents.slice(0, 5)) {
      const text = ev.detail ? `${ev.title}: ${ev.detail}` : ev.title;
      const claimId = ev.itemIds.flatMap((id) => claimIdsForItemId(caseView, id))[0];
      keyFacts.push({
        text,
        tag: statusToTag(ev.status),
        page: ev.chips[0]?.page,
        claimId,
      });
    }
    for (const item of docItems) {
      if (keyFacts.length >= 6) {
        break;
      }
      const val = valueText(item);
      if (!val) {
        continue;
      }
      const text = `${item.label}: ${val}`;
      if (keyFacts.some((k) => k.text === text)) {
        continue;
      }
      const claimId =
        item.state === "established"
          ? item.claimId
          : item.state === "changed"
            ? item.series.at(-1)?.claimId
            : undefined;
      keyFacts.push({
        text,
        tag: item.state === "changed" ? "changed" : undefined,
        page: chipsForItem(item)[0]?.page,
        claimId,
      });
    }

    const allFacts = docItems
      .map((item) => {
        const val = valueText(item);
        return val ? { label: item.label, value: val } : null;
      })
      .filter((row): row is { label: string; value: string } => row != null);

    const pages = [
      ...new Set([
        ...docItems.flatMap((i) => chipsForItem(i).map((c) => c.page)),
        ...linkedEvents.flatMap((e) => e.chips.map((c) => c.page)),
      ]),
    ]
      .filter((p) => p > 0)
      .sort((a, b) => a - b);

    const claimIds = [
      ...new Set(
        docItems.flatMap((item) => {
          if (item.state === "established") {
            return [item.claimId];
          }
          if (item.state === "changed") {
            return item.series.map((s) => s.claimId);
          }
          return [];
        }),
      ),
    ];

    const plan = isPlanDocument(doc);
    const change =
      docItems.some((i) => i.state === "changed") ||
      linkedEvents.some((e) => e.status === "changed");

    return {
      kind: "document",
      date,
      title: titleForDocument(doc),
      subtitle: plan && doc.documentType ? doc.documentType : undefined,
      docLabel: docShortLabel(doc),
      logicalDocumentId: doc.logicalDocumentId,
      plan,
      change,
      keyFacts: keyFacts.length ? keyFacts : [{ text: "Hive read this document.", page: doc.pageStart || 1 }],
      allFacts,
      pages: pages.length ? pages : [doc.pageStart || 1],
      claimIds,
    };
  });

  const entries = mergeDocEntriesWithGaps(docs, docEntries);

  const fluency = buildFluencyChart(caseView);

  if (fluency && entries.some((e) => e.kind === "gap")) {
    const gap = entries.find((e): e is TimelineGapEntry => e.kind === "gap");
    if (gap) {
      const firstAfter = docEntries.findIndex((d) => formatMonthYear(d.date) >= gap.to);
      fluency.gapStartIndex = 1;
      fluency.gapEndIndex = Math.max(1, firstAfter);
    }
  }

  return { entries, fluency };
}

export { formatDisplayDate };
