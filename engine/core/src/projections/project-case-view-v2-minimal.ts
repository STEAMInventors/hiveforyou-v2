import type { CanonicalCaseSnapshot, ValidatedClaim } from "@hiveforyou/shared/case-intelligence/3";

import type { CaseCustomerContextSnapshot } from "@hiveforyou/shared/case-customer-context";

import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";

import type {

  CaseHeader,

  CaseTimeline,

  CaseView,

  CaseViewV2,

  Chip,

  MeetingPrep,

  StoryLine,

} from "@hiveforyou/shared/projections";

import {

  CASE_VIEW_V2_SCHEMA,
  STORY_NARRATIVE_V2_SCHEMA,

  domainPackViewConfigForDomainId,

  isConstructIgnoredForChange,

  constructRoot,

} from "@hiveforyou/shared/projections";



import { projectCaseViewV1 } from "./project-case-view-v1";

import { formatClaimValue, humanizeConstruct } from "./format-v3-claim";

import { resolveVoice } from "./resolve-voice";

import type { ResolvedVoice, VoiceProposal } from "@hiveforyou/shared/projections";

import {

  buildAnatomyPlan,

  buildDocumentIndex,

  remapChips,

} from "./project-case-view-v2-plan";

import {
  buildStoryNarrativeV2,
  flattenStoryNarrativeToLines,
} from "./project-case-view-v2-story-narrative";

import { getNarrativeBlockByDomainId } from "@hiveforyou/domain-packs";

import type { Study } from "@hiveforyou/shared/pack-study";

import { buildPackStudyFromCaseProjection } from "../study/narrative/build-pack-study-from-projection";
import { composeNarrative } from "../study/narrative/composeNarrative";



type V2Input = {

  intelligence: CanonicalCaseSnapshot;

  provenance?: import("@hiveforyou/shared/projections").CaseProvenanceBundle | null;

  customerContext?: CaseCustomerContextSnapshot | null;

  statedWorkPurpose?: string | null;

  logicalDocuments?: CanonicalStudyContext["logicalDocuments"];

  proposalSchema?: CaseView["proposalSchema"];

  voiceProposal?: VoiceProposal | null;

  userText?: string | null;

  packStudy?: Study | null;

};



function referenceFromClaims(

  intelligence: CanonicalCaseSnapshot,

  packConfig: ReturnType<typeof domainPackViewConfigForDomainId>,

): CaseHeader["reference"] {

  const rules = packConfig?.changeRules ?? [];

  const rows: CaseHeader["reference"] = [];

  for (const claim of intelligence.claims) {

    if (!isConstructIgnoredForChange(claim.construct, rules)) {

      continue;

    }

    const label = humanizeConstruct(constructRoot(claim.construct));

    const display =

      claim.value.kind === "quantity"

        ? `${claim.value.amount}${claim.unit ? ` ${claim.unit}` : ""}`

        : claim.value.kind === "text"

          ? claim.value.text

          : claim.value.kind === "date"

            ? claim.value.value

            : claim.value.kind === "period"

              ? `${claim.value.start ?? ""} – ${claim.value.end ?? ""}`

              : constructRoot(claim.construct);

    rows.push({ label, display });

  }

  return rows;

}



function buildHeader(

  v1: CaseView,

  intelligence: CanonicalCaseSnapshot,

  voice: ResolvedVoice,

  statusCounts: CaseHeader["statusCounts"],

  currentPlanLabel: string | null,

  userText: string,

): CaseHeader {

  const pack = domainPackViewConfigForDomainId(intelligence.domainId);

  const eventWord = voice.eventNoun;

  const headline = `Here's where things stand before the ${eventWord}.`;

  const askedText =

    userText.trim() ||

    v1.intent.clientText?.trim() ||

    (v1.intent.label.trim() !== voice.documentsNoun ? v1.intent.label : "") ||

    "";

  return {

    breadcrumb: pack?.breadcrumb ?? v1.intent.label,

    headline,

    currentPlanLabel,

    askedText,

    documentsRead: v1.documents.length,

    statusCounts,

    reference: referenceFromClaims(intelligence, pack),

  };

}



function templatePrepQuestion(label: string): string {

  return `Can we clarify ${label.toLowerCase()}?`;

}



function buildPrep(v1: CaseView, planCards: ReturnType<typeof buildAnatomyPlan>["cards"]): MeetingPrep {

  const questions: MeetingPrep["questions"] = [];

  let q = 0;

  for (const card of planCards.filter((c) => c.status === "worth_a_question" || c.status === "changed")) {

    questions.push({

      questionId: `pq_${q++}`,

      text: templatePrepQuestion(card.title),

      fromCardId: card.cardId,

      fromChecklistEntryId: null,

      itemIds: card.itemIds,

    });

  }

  for (const itemId of v1.layout.gaps) {

    const item = v1.items.find((i) => i.itemId === itemId);

    if (item?.state !== "not_found") {

      continue;

    }

    questions.push({

      questionId: `pq_${q++}`,

      text: templatePrepQuestion(item.label),

      fromCardId: null,

      fromChecklistEntryId: null,

      itemIds: [itemId],

    });

  }



  const stayedCards = planCards.filter((c) => c.status === "looks_clear");

  return {

    questions,

    stayedSame: stayedCards.length

      ? {

          text: stayedCards

            .slice(0, 3)

            .map((c) => c.title)

            .join(", "),

          itemIds: stayedCards.flatMap((c) => c.itemIds),

        }

      : null,

    bring: v1.documents.slice(0, 5).map((doc) => ({

      label: doc.fileName.replace(/\.pdf$/i, ""),

      logicalDocumentId: doc.logicalDocumentId,

      page: doc.pageStart,

    })),

  };

}



function formatTimelineDate(raw: string): { value: string; precision: "year" | "month" | "day"; display: string } {

  const trimmed = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {

    return { value: trimmed, precision: "day", display: trimmed };

  }

  if (/^\d{4}-\d{2}$/.test(trimmed)) {

    return { value: trimmed, precision: "month", display: trimmed };

  }

  if (/^\d{4}$/.test(trimmed)) {

    return { value: trimmed, precision: "year", display: trimmed };

  }

  return { value: trimmed.slice(0, 10), precision: "day", display: trimmed };

}



function compareTimelineEvents(
  a: { occurredOn?: string; timelineOrderHint?: number; id: string },
  b: { occurredOn?: string; timelineOrderHint?: number; id: string },
): number {
  const aDate = a.occurredOn ?? "";
  const bDate = b.occurredOn ?? "";
  if (aDate !== bDate) {
    if (!aDate) {
      return 1;
    }
    if (!bDate) {
      return -1;
    }
    return aDate.localeCompare(bDate);
  }
  const aOrder = a.timelineOrderHint ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.timelineOrderHint ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  return a.id.localeCompare(b.id);
}

function buildTimeline(v1: CaseView, intelligence: CanonicalCaseSnapshot): CaseTimeline {
  const claimsById = new Map(intelligence.claims.map((c) => [c.id, c]));
  const changedClaimIds = new Set(intelligence.changes.flatMap((c) => [c.fromClaimId, c.toClaimId]));

  const sortedCanonical = [...intelligence.events].sort(compareTimelineEvents);

  const events: CaseTimeline["events"] = sortedCanonical
    .map((event) => {
      const claim = claimsById.get(event.claimId);
      const anchor =
        event.occurredOn?.trim() ||
        event.effectivePeriod?.start?.trim() ||
        event.effectivePeriod?.end?.trim() ||
        claim?.occurredOn?.trim() ||
        claim?.effectivePeriod?.start?.trim() ||
        claim?.effectivePeriod?.end?.trim();
      if (!anchor) {
        return null;
      }
      const construct = claim?.construct ?? event.construct;
      const title = humanizeConstruct(constructRoot(construct));
      const detail = claim ? formatClaimValue(claim.value, claim.unit) : null;
      const itemId = claim ? `itm_fact_${claim.id}` : null;
      const status = claim && changedClaimIds.has(claim.id) ? "changed" : "reference";

      return {
        eventId: event.id,
        kind: "document_event" as const,
        date: formatTimelineDate(anchor),
        endDate: event.effectivePeriod?.end
          ? formatTimelineDate(event.effectivePeriod.end)
          : claim?.effectivePeriod?.end
            ? formatTimelineDate(claim.effectivePeriod.end)
            : null,
        title,
        detail,
        status,
        itemIds: itemId && v1.items.some((i) => i.itemId === itemId) ? [itemId] : [],
        chips: [],
        requestId: null,
      };
    })
    .filter((row): row is CaseTimeline["events"][number] => row != null);

  if (events.length === 0) {
    const docs = [...v1.documents]
      .filter((d) => d.documentDate?.trim())
      .sort((a, b) => (a.documentDate ?? "").localeCompare(b.documentDate ?? ""));
    for (const doc of docs) {
      const anchor = doc.documentDate!.slice(0, 10);
      events.push({
        eventId: `tev_doc_${doc.logicalDocumentId}`,
        kind: "document_event",
        date: formatTimelineDate(anchor),
        endDate: null,
        title: doc.fileName?.trim() || doc.documentType || "Document",
        detail: doc.documentType?.trim() || null,
        status: "reference",
        itemIds: [],
        chips: [],
        requestId: null,
      });
    }
  }

  const eventIds = events.map((e) => e.eventId);

  return {
    coverage: { segments: [] },
    groups: [{ label: "", eventIds }],
    events,
  };
}



function remapItemChips(items: CaseView["items"], docIndex: ReturnType<typeof buildDocumentIndex>): CaseView["items"] {

  return items.map((item) => {

    if (item.state === "established") {

      return { ...item, chips: remapChips(item.chips, docIndex) };

    }

    if (item.state === "changed") {

      return {

        ...item,

        series: item.series.map((p) => ({ ...p, chips: remapChips(p.chips, docIndex) })),

      };

    }

    if (item.state === "conflicting") {

      return {

        ...item,

        sides: item.sides.map((s) => ({ ...s, chips: remapChips(s.chips, docIndex) })),

      };

    }

    if (item.state === "empty_field") {

      return { ...item, chips: remapChips(item.chips, docIndex) };

    }

    return item;

  });

}



export function projectCaseViewV2Minimal(input: V2Input): CaseViewV2 {

  const v1 = projectCaseViewV1(input);

  const pack = domainPackViewConfigForDomainId(input.intelligence.domainId);

  const userText =

    input.userText?.trim() ||

    input.statedWorkPurpose?.trim() ||

    v1.intent.clientText?.trim() ||

    "";

  const voice = resolveVoice({

    proposal: input.voiceProposal ?? null,

    userText,

    intentLabel: v1.intent.label,

    pack: pack?.voice ?? null,

    verifiedEvidence: (refs) => refs.length > 0,

  });



  const docIndex = buildDocumentIndex(v1.documents);

  const anatomy = buildAnatomyPlan({ v1, intelligence: input.intelligence, pack, docIndex });

  const prep = buildPrep(v1, anatomy.cards);

  const items = remapItemChips(v1.items, docIndex);
  const v1ForStory = { ...v1, items };

  const storyNarrative =
    pack != null
      ? buildStoryNarrativeV2({
          v1: v1ForStory,
          intelligence: input.intelligence,
          plan: anatomy,
          voice,
          userText,
          pack,
        })
      : { schemaVersion: STORY_NARRATIVE_V2_SCHEMA, movements: [] };
  const story = flattenStoryNarrativeToLines(storyNarrative);

  const narrativeBlock =
    getNarrativeBlockByDomainId(input.intelligence.domainId) ??
    getNarrativeBlockByDomainId(
      input.intelligence.domainPackId.replace(/^hive\.domain\./, ""),
    );
  const packStudy =
    input.packStudy ??
    (narrativeBlock ? buildPackStudyFromCaseProjection({ v1, intelligence: input.intelligence, anatomy, pack }) : null);
  const packNarrative =
    packStudy && narrativeBlock ? composeNarrative({ narrative: narrativeBlock }, packStudy) : null;



  return {

    ...v1,

    schemaVersion: CASE_VIEW_V2_SCHEMA,

    voice,

    items,

    header: buildHeader(
      v1,
      input.intelligence,
      voice,
      anatomy.statusCounts,
      anatomy.currentPlanLabel,
      userText,
    ),

    story,

    packNarrative,

    validatedStory: null,

    storyNarrative,

    plan: {

      sections: anatomy.sections,

      cards: anatomy.cards,

    },

    checklist: [],

    prep,

    timeline: buildTimeline(v1, input.intelligence),

    clientSummary: {

      ...v1.clientSummary,

      selectionRule: "anatomy plan + client-writer/2 when enabled",

      emptyStateText: null,

    },

  };

}


