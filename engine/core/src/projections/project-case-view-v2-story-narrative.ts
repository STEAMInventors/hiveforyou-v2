import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type {
  CaseView,
  ConflictItem,
  DomainPackViewConfigV2,
  MeasureDirection,
  NotFoundItem,
  PlanCard,
  ResolvedVoice,
  StoryLine,
  StoryMovement,
  StoryMovementId,
  StoryNarrativeSlot,
  StoryNarrativeV2,
} from "@hiveforyou/shared/projections";
import {
  STORY_NARRATIVE_V2_SCHEMA,
  constructRoot,
  normalizeMeasureRoot,
} from "@hiveforyou/shared/projections";

import type { AnatomyPlanResult } from "./project-case-view-v2-plan";
import { collectFactRowsForNarrative } from "./project-case-view-v2-plan";
import type { FactRow } from "./project-case-view-v2-plan-types";
import { eligibilityChangedStory, goalProgressStorySentence } from "./project-case-view-v2-plan-copy";

const WCPM_UNIT = /^(wcpm|words per minute)$/i;

type ProgressPoint = {
  itemId: string;
  measureRoot: string;
  sortKey: string;
  value: number;
  chips: FactRow["chips"];
  task: string | null;
};

function movement(
  movementId: StoryMovementId,
  slots: StoryNarrativeSlot[],
): StoryMovement {
  return { movementId, slots: slots.filter(Boolean) };
}

function directionForRow(
  pack: DomainPackViewConfigV2,
  row: FactRow,
): MeasureDirection | null {
  const root = normalizeMeasureRoot(constructRoot(row.measure));
  const dir = pack.measureDirection?.[root];
  if (dir) {
    return dir;
  }
  if (root === "baseline" && WCPM_UNIT.test(row.display?.unit ?? "")) {
    return pack.measureDirection?.oral_reading_fluency ?? pack.measureDirection?.wcpm ?? null;
  }
  return null;
}

function progressSeriesKey(row: FactRow): string | null {
  const root = normalizeMeasureRoot(constructRoot(row.measure));
  if (root === "baseline" && WCPM_UNIT.test(row.display?.unit ?? "")) {
    return `wcpm:${row.task ?? "reading"}`;
  }
  if (root === "oral_reading_fluency" || root === "wcpm") {
    return `wcpm:${row.task ?? "reading"}`;
  }
  return null;
}

function pointsFromRows(rows: FactRow[], pack: DomainPackViewConfigV2): ProgressPoint[] {
  const out: ProgressPoint[] = [];
  for (const row of rows) {
    const dir = directionForRow(pack, row);
    const series = progressSeriesKey(row);
    if (
      !dir ||
      !series ||
      !row.display ||
      row.display.kind !== "quantity" ||
      row.display.numberValue == null
    ) {
      continue;
    }
    out.push({
      itemId: row.itemId,
      measureRoot: series,
      sortKey: row.documentSortKey,
      value: row.display.numberValue,
      chips: row.chips,
      task: row.task,
    });
  }
  return out.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function improved(
  direction: MeasureDirection,
  from: number,
  to: number,
): boolean {
  return direction === "higher_is_better" ? to > from : to < from;
}

function chipLabel(chip: { fileName: string; page: number }): string {
  return `${chip.fileName} · p.${chip.page}`;
}

export function buildStoryNarrativeV2(input: {
  v1: CaseView;
  intelligence: CanonicalCaseSnapshot;
  plan: AnatomyPlanResult;
  voice: ResolvedVoice;
  userText: string;
  pack: DomainPackViewConfigV2;
}): StoryNarrativeV2 {
  const { v1, plan, voice, userText, pack } = input;
  const rows = collectFactRowsForNarrative(v1);
  const usedItemIds = new Set<string>();
  const markUsed = (ids: string[]) => ids.forEach((id) => usedItemIds.add(id));

  const orientationSlots: StoryNarrativeSlot[] = [];
  if (plan.currentPlanLabel) {
    orientationSlots.push({
      slotId: "ori_plan",
      slotType: "orientation_plan",
      itemIds: [],
      text: plan.currentPlanLabel,
      fallbackUsed: true,
      chips: [],
    });
  }
  const upcoming = v1.documents
    .filter((d) => d.documentDate && d.documentDate >= new Date().toISOString().slice(0, 10))
    .slice(0, 2);
  if (upcoming.length) {
    orientationSlots.push({
      slotId: "ori_dates",
      slotType: "orientation_dates",
      itemIds: [],
      text: upcoming.map((d) => d.fileName.replace(/\.pdf$/i, "")).join(", "),
      fallbackUsed: true,
      chips: [],
    });
  }
  const echo =
    userText.trim() ||
    v1.intent.clientText?.trim() ||
    (v1.intent.label.trim() !== voice.documentsNoun ? v1.intent.label : "");
  if (echo) {
    orientationSlots.push({
      slotId: "ori_echo",
      slotType: "echo",
      itemIds: [],
      text: echo,
      fallbackUsed: true,
      chips: [],
    });
  }

  const worthCards = plan.cards.filter((c) => c.status === "worth_a_question");

  const goingWellSlots: StoryNarrativeSlot[] = [];
  const bySeries = new Map<string, ProgressPoint[]>();
  for (const point of pointsFromRows(rows, pack)) {
    const list = bySeries.get(point.measureRoot) ?? [];
    list.push(point);
    bySeries.set(point.measureRoot, list);
  }

  for (const [seriesKey, points] of bySeries) {
    if (points.length < 2) {
      continue;
    }
    const dir =
      pack.measureDirection?.oral_reading_fluency ??
      pack.measureDirection?.wcpm ??
      "higher_is_better";
    const first = points[0]!;
    const last = points[points.length - 1]!;
    if (!improved(dir, first.value, last.value)) {
      continue;
    }
    const itemIds = [first.itemId];
    markUsed(itemIds);
    goingWellSlots.push({
      slotId: `gw_prog_${seriesKey}`,
      slotType: "progress",
      itemIds,
      text: `${first.value}→${last.value}`,
      fallbackUsed: true,
      chips: [first.chips[0], last.chips[0]].filter(Boolean).map((c) => c!),
    });
  }

  const steadyCards = plan.cards
    .filter((c) => c.status === "looks_clear" && (c.sectionId === "services" || c.sectionId === "accommodations"))
    .slice(0, 3);
  if (steadyCards.length) {
    const steadyIds = steadyCards.flatMap((c) => c.itemIds);
    markUsed(steadyIds);
    goingWellSlots.push({
      slotId: "gw_steady",
      slotType: "steady",
      itemIds: steadyIds,
      cardId: null,
      text: steadyCards.map((c) => c.title).join(", "),
      fallbackUsed: true,
      chips: steadyCards.flatMap((c) => c.chips).slice(0, 4),
    });
  }

  const closerLookSlots: StoryNarrativeSlot[] = [];
  const pushCloser = (slot: StoryNarrativeSlot) => {
    if (closerLookSlots.length >= 3) {
      return;
    }
    closerLookSlots.push(slot);
  };

  for (const card of worthCards) {
    const ctx = plan.cardContextById.get(card.cardId);
    if (!ctx) {
      continue;
    }
    const baseline = ctx.rows.find((r) => constructRoot(r.measure) === "baseline");
    const latest = ctx.rows.find((r) => constructRoot(r.measure) === "oral_reading_fluency");
    const target = ctx.rows.find((r) => constructRoot(r.measure) === "annual_goal_target");
    const bVal = baseline?.display?.numberValue;
    const lVal = latest?.display?.numberValue;
    const tVal = target?.display?.numberValue;
    if (bVal != null && lVal != null && tVal != null) {
      const ids = card.itemIds.filter((id) => !usedItemIds.has(id));
      markUsed(ids.length ? ids : card.itemIds);
      pushCloser({
        slotId: `cl_pst_${card.cardId}`,
        slotType: "progress_short_of_target",
        itemIds: ids.length ? ids : card.itemIds,
        cardId: card.cardId,
        text: goalProgressStorySentence(ctx.rows) ?? card.oneLiner,
        fallbackUsed: true,
        chips: card.chips.slice(0, 4),
        progressShortOfTarget: {
          baseline: bVal,
          latest: lVal,
          target: tVal,
          unit: "words per minute",
        },
        questionRequest: "What's the plan for this goal in the new IEP?",
      });
      continue;
    }
    markUsed(card.itemIds);
    pushCloser({
      slotId: `cl_waq_${card.cardId}`,
      slotType: "worth_a_question",
      itemIds: card.itemIds,
      cardId: card.cardId,
      text: card.oneLiner,
      fallbackUsed: true,
      chips: card.chips.slice(0, 4),
      questionRequest: card.title,
    });
  }

  for (const card of plan.cards.filter((c) => c.status === "changed")) {
    if (closerLookSlots.length >= 3) {
      break;
    }
    if (card.itemIds.every((id) => usedItemIds.has(id))) {
      continue;
    }
    markUsed(card.itemIds);
    const ctx = plan.cardContextById.get(card.cardId);
    const text =
      card.sectionId === "eligibility" && ctx
        ? eligibilityChangedStory(ctx.rows) ?? card.oneLiner
        : card.oneLiner;
    pushCloser({
      slotId: `cl_chg_${card.cardId}`,
      slotType: "changed",
      itemIds: card.itemIds,
      cardId: card.cardId,
      text,
      fallbackUsed: true,
      chips: card.chips.slice(0, 4),
      questionRequest:
        card.sectionId === "eligibility" && card.title === "Eligibility"
          ? "Worth raising: what goal will track reading comprehension in the new IEP?"
          : `What changed about ${card.title.toLowerCase()}?`,
    });
  }

  for (const item of v1.items) {
    if (closerLookSlots.length >= 3) {
      break;
    }
    if (item.state !== "conflicting") {
      continue;
    }
    const conflict = item as ConflictItem;
    if (conflict.itemId && usedItemIds.has(conflict.itemId)) {
      continue;
    }
    markUsed([conflict.itemId]);
    pushCloser({
      slotId: `cl_conf_${conflict.itemId}`,
      slotType: "conflict",
      itemIds: [conflict.itemId],
      text: conflict.label,
      fallbackUsed: true,
      chips: conflict.sides.flatMap((s) => s.chips).slice(0, 2),
      questionRequest: conflict.label,
    });
  }

  const wouldHelpSlots: StoryNarrativeSlot[] = [];
  const notFound = v1.items.filter((i): i is NotFoundItem => i.state === "not_found").slice(0, 2);
  for (const item of notFound) {
    if (wouldHelpSlots.length >= 2) {
      break;
    }
    markUsed([item.itemId]);
    wouldHelpSlots.push({
      slotId: `wh_${item.itemId}`,
      slotType: "missing_document",
      itemIds: [item.itemId],
      text: item.label,
      fallbackUsed: true,
      chips: [],
      documentType: item.request.documentType,
      questionRequest: item.request.label,
    });
  }

  const nextStepSlots: StoryNarrativeSlot[] = [];
  if (wouldHelpSlots.length) {
    nextStepSlots.push({
      slotId: "next_add_files",
      slotType: "next_add_files",
      itemIds: wouldHelpSlots.flatMap((s) => s.itemIds),
      text: "Add the missing files so Hive can finish the picture.",
      fallbackUsed: true,
      chips: [],
    });
  } else {
    const qCount = plan.cards.filter(
      (c) => c.status === "worth_a_question" || c.status === "changed",
    ).length;
    nextStepSlots.push({
      slotId: "next_prep",
      slotType: "next_meeting_prep",
      itemIds: [],
      text: `Review ${qCount} meeting question${qCount === 1 ? "" : "s"} in Meeting prep.`,
      fallbackUsed: true,
      chips: [],
    });
  }

  const movements: StoryMovement[] = [
    movement("orientation", orientationSlots),
    ...(goingWellSlots.length ? [movement("going_well", goingWellSlots)] : []),
    ...(closerLookSlots.length ? [movement("closer_look", closerLookSlots)] : []),
    ...(wouldHelpSlots.length ? [movement("would_help", wouldHelpSlots)] : []),
    movement("next_step", nextStepSlots),
  ];

  return { schemaVersion: STORY_NARRATIVE_V2_SCHEMA, movements };
}

export function flattenStoryNarrativeToLines(narrative: StoryNarrativeV2): StoryLine[] {
  const lines: StoryLine[] = [];
  for (const block of narrative.movements) {
    if (block.movementId === "orientation" || block.movementId === "next_step") {
      continue;
    }
    for (const slot of block.slots) {
      if (slot.slotType === "steady" && slot.text) {
        lines.push({
          slotId: slot.slotId,
          slotType: "stayed_same",
          itemIds: slot.itemIds,
          text: `${slot.text} stayed the same.`,
          fallbackUsed: slot.fallbackUsed,
          chips: slot.chips,
        });
        continue;
      }
      if (slot.slotType === "progress") {
        lines.push({
          slotId: slot.slotId,
          slotType: "goal_progress",
          itemIds: slot.itemIds,
          text: `Progress: ${slot.text}.`,
          fallbackUsed: slot.fallbackUsed,
          chips: slot.chips,
        });
        continue;
      }
      if (slot.slotType === "progress_short_of_target") {
        lines.push({
          slotId: slot.slotId,
          slotType: "goal_progress",
          itemIds: slot.itemIds,
          text: slot.text,
          fallbackUsed: slot.fallbackUsed,
          chips: slot.chips,
        });
        continue;
      }
      if (slot.slotType === "changed") {
        lines.push({
          slotId: slot.slotId,
          slotType: "changed",
          itemIds: slot.itemIds,
          text: slot.text,
          fallbackUsed: slot.fallbackUsed,
          chips: slot.chips,
        });
        continue;
      }
    }
  }
  const closer = narrative.movements.find((m) => m.movementId === "closer_look");
  const topSlot =
    closer?.slots.find((s) => s.slotType === "changed" && s.questionRequest?.includes("comprehension")) ??
    closer?.slots.find((s) => s.slotType === "progress_short_of_target") ??
    closer?.slots.find((s) => s.questionRequest);
  if (topSlot?.questionRequest) {
    lines.push({
      slotId: "slot_top_q",
      slotType: "top_question",
      itemIds: topSlot.itemIds,
      text: topSlot.questionRequest,
      fallbackUsed: topSlot.fallbackUsed,
      chips: topSlot.chips.slice(0, 2),
    });
  }
  return lines;
}

export { chipLabel };
