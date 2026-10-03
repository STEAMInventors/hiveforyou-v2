import type { CardStatus, CaseView, MeetingPrep, PlanCard, ResolvedVoice, StoryLine } from "@hiveforyou/shared/projections";

import type { AnatomyPlanResult } from "./project-case-view-v2-plan";
import {
  eligibilityChangedStory,
  goalProgressStorySentence,
  goalTopQuestionSentence,
} from "./project-case-view-v2-plan-copy";

function joinCardLabels(cards: PlanCard[], max: number): string {
  const labels = cards.slice(0, max).map((c) => c.title);
  if (labels.length === 1) {
    return labels[0]!;
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function templateChanged(card: PlanCard, plan: AnatomyPlanResult): string {
  if (card.sectionId === "eligibility") {
    const ctx = plan.cardContextById.get(card.cardId);
    const story = ctx ? eligibilityChangedStory(ctx.rows) : null;
    if (story) {
      return story;
    }
  }
  if (card.sinceLine?.trim()) {
    return `${card.title} changed. ${card.oneLiner}. ${card.sinceLine}.`;
  }
  return `${card.title} changed. ${card.oneLiner}.`;
}

export function buildStoryFromPlan(input: {
  v1: CaseView;
  plan: AnatomyPlanResult;
  prep: MeetingPrep;
  voice: ResolvedVoice;
  userText: string;
}): StoryLine[] {
  const { v1, plan, voice, userText } = input;
  const lines: StoryLine[] = [];
  const cards = plan.cards;

  const echoCandidate =
    userText.trim() ||
    v1.intent.clientText?.trim() ||
    (v1.intent.label.trim() !== voice.documentsNoun ? v1.intent.label.trim() : "");
  if (echoCandidate) {
    lines.push({
      slotId: "slot_echo",
      slotType: "echo",
      itemIds: [],
      text: echoCandidate,
      fallbackUsed: true,
      chips: [],
    });
  }

  const stayedCards = cards.filter((c) => c.status === "looks_clear");
  if (stayedCards.length) {
    lines.push({
      slotId: "slot_stayed",
      slotType: "stayed_same",
      itemIds: stayedCards.flatMap((c) => c.itemIds).slice(0, 12),
      text: `${joinCardLabels(stayedCards, 3)} stayed the same.`,
      fallbackUsed: true,
      chips: stayedCards.flatMap((c) => c.chips).slice(0, 4),
    });
  }

  if (plan.noReadingGoalInCurrentPlan) {
    const year = plan.currentPlanLabel?.match(/\d{4}/)?.[0] ?? "the new";
    lines.push({
      slotId: "slot_no_goal",
      slotType: "changed",
      itemIds: [],
      text: `We didn't find a reading goal in the ${year} IEP.`,
      fallbackUsed: true,
      chips: [],
    });
  }

  const worthCards = cards.filter((c) => c.status === "worth_a_question");
  if (worthCards.length) {
    const card = worthCards[0]!;
    const ctx = plan.cardContextById.get(card.cardId);
    const progressText = ctx ? goalProgressStorySentence(ctx.rows) : null;
    lines.push({
      slotId: "slot_goal_progress",
      slotType: "goal_progress",
      itemIds: card.itemIds,
      text: progressText ?? card.oneLiner,
      fallbackUsed: true,
      chips: card.chips.slice(0, 4),
    });
  }

  for (const card of cards.filter((c) => c.status === "changed")) {
    lines.push({
      slotId: `slot_chg_${card.cardId}`,
      slotType: "changed",
      itemIds: card.itemIds,
      text: templateChanged(card, plan),
      fallbackUsed: true,
      chips: card.chips.slice(0, 4),
    });
  }

  const eligibilityNeedChanged = cards.find(
    (c) => c.status === "changed" && c.sectionId === "eligibility" && c.title === "Eligibility",
  );
  const topCard = eligibilityNeedChanged ?? worthCards[0];
  if (topCard) {
    const ctx = plan.cardContextById.get(topCard.cardId);
    const question =
      topCard.title === "Eligibility" && topCard.status === "changed"
        ? "Worth raising: what goal will track reading comprehension in the new IEP?"
        : topCard.sectionId === "goals" && ctx
          ? goalTopQuestionSentence(ctx.rows, ctx.noGoalInCurrentPlan)
          : `What should we clarify about ${topCard.title.toLowerCase()}?`;
    lines.push({
      slotId: "slot_top_q",
      slotType: "top_question",
      itemIds: topCard.itemIds,
      text: question ?? `What should we clarify about ${topCard.title.toLowerCase()}?`,
      fallbackUsed: true,
      chips: topCard.chips.slice(0, 2),
    });
  }

  return lines;
}

export function cardStatusPriority(a: CardStatus, b: CardStatus): number {
  const order: CardStatus[] = [
    "worth_a_question",
    "two_versions",
    "changed",
    "not_in_your_documents",
    "looks_clear",
    "reference",
  ];
  return order.indexOf(a) - order.indexOf(b);
}
