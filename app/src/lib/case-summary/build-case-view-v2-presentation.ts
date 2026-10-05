import {
  CASE_VIEW_V2_SCHEMA,
  CARD_STATUS_PRIORITY,
  type CardStatus,
  type CaseHeader,
  type CaseItemV2,
  type CaseTimeline,
  type CaseView,
  type CaseViewV2,
  type ChecklistEntry,
  type Chip,
  type MeetingPrep,
  type PlanCard,
  type PlanSection,
  type StoryLine,
  GENERIC_VOICE,
  STORY_NARRATIVE_V2_SCHEMA,
  type ResolvedVoice,
} from "@hiveforyou/shared/projections";
import { IEP_DOMAIN_VIEW } from "@hiveforyou/shared/projections";

function genericResolvedVoice(): ResolvedVoice {
  return {
    ...GENERIC_VOICE,
    sources: {
      subject: "generic",
      eventNoun: "generic",
      helperNoun: "generic",
      otherPartyNoun: "generic",
      planNoun: "generic",
      documentsNoun: "generic",
    },
    subjectName: null,
    useSubjectName: false,
  };
}

import type { CaseSummaryModel } from "./case-summary-presentation";

function chipLabel(chip: Chip): string {
  const name = chip.fileName.replace(/\.pdf$/i, "").replace(/_/g, " ");
  return `${name} · p.${chip.page}`;
}

function worstStatus(statuses: CardStatus[]): CardStatus {
  for (const s of CARD_STATUS_PRIORITY) {
    if (statuses.includes(s)) {
      return s;
    }
  }
  return "looks_clear";
}

function itemToCardStatus(state: string): CardStatus {
  switch (state) {
    case "conflicting":
      return "two_versions";
    case "changed":
      return "changed";
    case "not_found":
    case "empty_field":
      return "not_in_your_documents";
    case "unclear_identity":
      return "worth_a_question";
    default:
      return "looks_clear";
  }
}

function buildHeader(v1: CaseView, summary: CaseSummaryModel): CaseHeader {
  const openNeeds = summary.statusCounts.needs;
  return {
    breadcrumb: summary.domainLabel,
    headline:
      openNeeds > 0
        ? "Hive needs you on one thing before the meeting."
        : IEP_DOMAIN_VIEW.meetingHeadline,
    askedText: v1.intent.clientText?.trim() || v1.intent.label,
    documentsRead: v1.documents.length,
    statusCounts: {
      worthAsking: summary.statusCounts.needs,
      changed: summary.statusCounts.changed,
      missing: summary.statusCounts.missing,
      looksClear: summary.statusCounts.checked,
    },
    reference: [],
  };
}

function buildStory(v1: CaseView, summary: CaseSummaryModel): StoryLine[] {
  const lines: StoryLine[] = [];
  let slot = 0;
  for (const item of v1.clientSummary.items.slice(0, 4)) {
    lines.push({
      slotId: `cs-${slot++}`,
      slotType: item.worthAsking ? "relationship" : "stayed_same",
      itemIds: [item.sourceItemId],
      text: item.text,
      fallbackUsed: false,
      chips: item.chips,
    });
  }
  if (lines.length === 0) {
    for (const change of summary.changes.slice(0, 3)) {
      lines.push({
        slotId: `ch-${slot++}`,
        slotType: "changed",
        itemIds: [change.id],
        text: change.text,
        fallbackUsed: true,
        chips: [],
      });
    }
  }
  const topQ = v1.clientSummary.questions[0];
  if (topQ) {
    lines.push({
      slotId: "top-q",
      slotType: "top_question",
      itemIds: [topQ.sourceSummaryItemId],
      text: topQ.text,
      fallbackUsed: false,
      chips: [],
    });
  } else if (summary.changes[0]?.ask) {
    lines.push({
      slotId: "top-q",
      slotType: "top_question",
      itemIds: [summary.changes[0].id],
      text: summary.changes[0].ask,
      fallbackUsed: true,
      chips: [],
    });
  }
  return lines;
}

function buildPlan(v1: CaseView): { sections: PlanSection[]; cards: PlanCard[] } {
  const itemsById = new Map(v1.items.map((i) => [i.itemId, i]));
  const entityById = new Map(v1.entities.map((e) => [e.entityId, e]));
  const cards: PlanCard[] = [];
  const sectionCards = new Map<string, string[]>();

  for (const section of IEP_DOMAIN_VIEW.anatomy.sections) {
    sectionCards.set(section.sectionId, []);
  }

  const entityIds = new Set<string>();
  for (const item of v1.items) {
    if ("subjectEntityId" in item && item.subjectEntityId) {
      entityIds.add(item.subjectEntityId);
    }
  }

  for (const entityId of entityIds) {
    const entity = entityById.get(entityId);
    if (!entity) {
      continue;
    }
    const section = IEP_DOMAIN_VIEW.anatomy.sections.find((s) =>
      s.entityTypes.includes(entity.entityType),
    );
    if (!section) {
      continue;
    }
    const relatedItems = v1.items.filter(
      (i) => "subjectEntityId" in i && i.subjectEntityId === entityId,
    );
    const statuses = relatedItems.map((i) => itemToCardStatus(i.state));
    const fact = relatedItems.find((i) => i.state === "established");
    const change = relatedItems.find((i) => i.state === "changed");
    const oneLiner =
      fact && fact.state === "established"
        ? fact.value.display
        : change && change.state === "changed"
          ? change.label
          : entity.displayName;
    const summaryItem = v1.clientSummary.items.find((ci) =>
      relatedItems.some((ri) => ri.itemId === ci.sourceItemId),
    );
    const cardId = `card-${entityId}`;
    cards.push({
      cardId,
      sectionId: section.sectionId,
      entityId,
      title: entity.displayName || fact?.label || change?.label || "Plan item",
      status: worstStatus(statuses),
      itemIds: relatedItems.map((i) => i.itemId),
      oneLiner,
      sinceLine: change && change.state === "changed" ? "Changed since prior documents" : null,
      whyLine: summaryItem?.worthAsking || null,
      questionId: v1.clientSummary.questions.find((q) => q.sourceSummaryItemId === summaryItem?.summaryItemId)
        ?.questionId ?? null,
      chips: relatedItems.flatMap((i) => ("chips" in i ? i.chips : [])),
    });
    sectionCards.get(section.sectionId)?.push(cardId);
  }

  if (cards.length === 0) {
    for (const group of v1.layout.facts.slice(0, 8)) {
      const sectionId = "services";
      const cardId = `card-fg-${group.groupId}`;
      const groupItems = group.itemIds.map((id) => itemsById.get(id)).filter(Boolean);
      cards.push({
        cardId,
        sectionId,
        entityId: group.entityId ?? group.groupId,
        title: group.label,
        status: "looks_clear",
        itemIds: group.itemIds,
        oneLiner: groupItems[0] && groupItems[0].state === "established" ? groupItems[0].value.display : group.label,
        sinceLine: null,
        whyLine: null,
        questionId: null,
        chips: groupItems.flatMap((i) => (i && "chips" in i ? i.chips : [])),
      });
      sectionCards.get(sectionId)?.push(cardId);
    }
  }

  const sections: PlanSection[] = IEP_DOMAIN_VIEW.anatomy.sections
    .map((s) => ({
      sectionId: s.sectionId,
      label: s.label.toUpperCase(),
      cardIds: sectionCards.get(s.sectionId) ?? [],
    }))
    .filter((s) => s.cardIds.length > 0 || s.sectionId === "dates");

  if (!sections.some((s) => s.sectionId === "dates")) {
    sections.push({ sectionId: "dates", label: "DATES", cardIds: [] });
  }

  return { sections, cards };
}

function buildChecklist(v1: CaseView): ChecklistEntry[] {
  const entries: ChecklistEntry[] = [];
  for (const doc of v1.documents) {
    entries.push({
      entryId: `doc-${doc.logicalDocumentId}`,
      label: doc.documentType.replace(/_/g, " ") || doc.fileName,
      status: "have",
      logicalDocumentIds: [doc.logicalDocumentId],
      reason: null,
      reasonItemIds: [],
      requestId: null,
      source: "pack_expected_document",
    });
  }
  for (const item of v1.items) {
    if (item.state !== "not_found") {
      continue;
    }
    entries.push({
      entryId: item.itemId,
      label: item.label,
      status: "missing",
      logicalDocumentIds: [],
      reason: item.description,
      reasonItemIds: [item.itemId],
      requestId: item.request.requestId,
      source: item.source === "proposal_gap" ? "proposal_gap" : "period_gap",
    });
  }
  for (const req of v1.clientSummary.requests) {
    if (entries.some((e) => e.requestId === req.requestId)) {
      continue;
    }
    entries.push({
      entryId: `req-${req.requestId}`,
      label: req.label,
      status: "missing",
      logicalDocumentIds: [],
      reason: req.label,
      reasonItemIds: [],
      requestId: req.requestId,
      source: "proposal_gap",
    });
  }
  return entries;
}

function buildPrep(v1: CaseView, summary: CaseSummaryModel): MeetingPrep {
  const questions = v1.clientSummary.questions.map((q) => ({
    questionId: q.questionId,
    text: q.text,
    fromCardId: null,
    fromChecklistEntryId: null,
    itemIds: [q.sourceSummaryItemId],
  }));
  if (questions.length === 0) {
    summary.changes.forEach((change, i) => {
      questions.push({
        questionId: `gen-${i}`,
        text: change.ask,
        fromCardId: null,
        fromChecklistEntryId: null,
        itemIds: [change.id],
      });
    });
  }
  const checkedPreview = summary.checkedPreview.map((r) => r.text).join(". ");
  return {
    questions,
    stayedSame: checkedPreview
      ? { text: checkedPreview, itemIds: [] }
      : null,
    bring: v1.documents.slice(0, 4).map((doc) => ({
      label: doc.fileName.replace(/\.pdf$/i, ""),
      logicalDocumentId: doc.logicalDocumentId,
      page: doc.pageStart,
    })),
  };
}

function buildTimeline(v1: CaseView): CaseTimeline {
  const events: CaseTimeline["events"] = [];
  let n = 0;
  for (const doc of v1.documents) {
    if (!doc.documentDate) {
      continue;
    }
    events.push({
      eventId: `ev-${n++}`,
      kind: "document_event",
      date: {
        value: doc.documentDate.slice(0, 10),
        precision: doc.documentDate.length >= 10 ? "day" : "year",
        display: doc.documentDate,
      },
      endDate: null,
      title: doc.fileName.replace(/\.pdf$/i, ""),
      detail: null,
      status: "reference",
      itemIds: [],
      chips: [],
      requestId: null,
    });
  }
  for (const item of v1.items) {
    if (item.state !== "changed") {
      continue;
    }
    for (const point of item.series) {
      events.push({
        eventId: `ev-${n++}`,
        kind: "document_event",
        date: {
          value: point.anchorDate.slice(0, 10),
          precision: "day",
          display: point.anchorDate,
        },
        endDate: null,
        title: item.label,
        detail: point.value.display,
        status: "changed",
        itemIds: [item.itemId],
        chips: point.chips,
        requestId: null,
      });
    }
  }
  events.sort((a, b) => (a.date?.value ?? "").localeCompare(b.date?.value ?? ""));
  const groups: CaseTimeline["groups"] = [];
  const byYear = new Map<string, string[]>();
  for (const ev of events) {
    const year = ev.date?.value.slice(0, 4) ?? "Unknown";
    if (!byYear.has(year)) {
      byYear.set(year, []);
    }
    byYear.get(year)!.push(ev.eventId);
  }
  for (const [label, eventIds] of byYear) {
    groups.push({ label, eventIds });
  }
  return {
    coverage: { segments: [] },
    groups,
    events,
  };
}

export function buildCaseViewV2FromV1(v1: CaseView, summary: CaseSummaryModel): CaseViewV2 {
  const items: CaseItemV2[] = [...v1.items];
  return {
    ...v1,
    schemaVersion: CASE_VIEW_V2_SCHEMA,
    items,
    header: buildHeader(v1, summary),
    story: buildStory(v1, summary),
    plan: buildPlan(v1),
    checklist: buildChecklist(v1),
    prep: buildPrep(v1, summary),
    timeline: buildTimeline(v1),
    voice: genericResolvedVoice(),
    packNarrative: null,
    storyNarrative: { schemaVersion: STORY_NARRATIVE_V2_SCHEMA, movements: [] },
  };
}

export function buildCaseViewV2FromSummaryOnly(
  summary: CaseSummaryModel,
  documentCount: number,
): Pick<CaseViewV2, "header" | "story" | "plan" | "checklist" | "prep" | "timeline"> {
  const header: CaseHeader = {
    breadcrumb: summary.domainLabel,
    headline:
      summary.statusCounts.needs > 0
        ? "Hive needs you on one thing before the meeting."
        : IEP_DOMAIN_VIEW.meetingHeadline,
    askedText: "Understand my documents",
    documentsRead: documentCount,
    statusCounts: {
      worthAsking: summary.statusCounts.needs,
      changed: summary.statusCounts.changed,
      missing: summary.statusCounts.missing,
      looksClear: summary.statusCounts.checked,
    },
    reference: [],
  };
  const story: StoryLine[] = summary.changes.map((c, i) => ({
    slotId: `ch-${i}`,
    slotType: "changed" as const,
    itemIds: [c.id],
    text: c.text,
    fallbackUsed: true,
    chips: [],
  }));
  if (summary.changes[0]?.ask) {
    story.push({
      slotId: "top-q",
      slotType: "top_question",
      itemIds: [summary.changes[0].id],
      text: summary.changes[0].ask,
      fallbackUsed: true,
      chips: [],
    });
  }
  const cards: PlanCard[] = summary.changes.map((c) => ({
    cardId: c.id,
    sectionId: "goals",
    entityId: c.id,
    title: c.slot,
    status: "changed" as CardStatus,
    itemIds: [c.id],
    oneLiner: c.text,
    sinceLine: null,
    whyLine: c.ask,
    questionId: null,
    chips: [],
  }));
  for (const row of summary.checkedPreview) {
    cards.push({
      cardId: `chk-${row.text}`,
      sectionId: "services",
      entityId: row.text,
      title: row.text,
      status: "looks_clear",
      itemIds: [],
      oneLiner: row.text,
      sinceLine: null,
      whyLine: null,
      questionId: null,
      chips: [],
    });
  }
  return {
    header,
    story,
    plan: {
      sections: [
        { sectionId: "goals", label: "GOALS", cardIds: summary.changes.map((c) => c.id) },
        {
          sectionId: "services",
          label: "SERVICES",
          cardIds: summary.checkedPreview.map((r) => `chk-${r.text}`),
        },
      ],
      cards,
    },
    checklist: summary.gaps.map((g) => ({
      entryId: g.id,
      label: g.text,
      status: "missing" as const,
      logicalDocumentIds: [],
      reason: g.invite,
      reasonItemIds: [g.id],
      requestId: null,
      source: "proposal_gap" as const,
    })),
    prep: {
      questions: summary.changes.map((c, i) => ({
        questionId: `pq-${i}`,
        text: c.ask,
        fromCardId: c.id,
        fromChecklistEntryId: null,
        itemIds: [c.id],
      })),
      stayedSame:
        summary.checkedPreview.length > 0
          ? {
              text: summary.checkedPreview.map((r) => r.text).join(". "),
              itemIds: [],
            }
          : null,
      bring: [],
    },
    timeline: { coverage: { segments: [] }, groups: [], events: [] },
  };
}

export { chipLabel, IEP_DOMAIN_VIEW };
