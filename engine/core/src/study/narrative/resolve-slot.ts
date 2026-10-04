import type { NarrativeBlock } from "@hiveforyou/domain-pack";
import type { Study } from "@hiveforyou/shared/pack-study";

import { buildGoalMetClause, buildGoalsDiffClause, buildReevalSummary } from "./derived-clauses";
import { formatFactForNarrative } from "./format-slot-value";

export type ResolvedSlot = {
  text: string;
  factIds: string[];
};

export function resolveNarrativeSlot(
  block: NarrativeBlock,
  study: Study,
  slot: string,
): ResolvedSlot | null {
  if (slot === "series.next.goalMetClause") {
    if (!study.seriesAfterPrior) {
      return null;
    }
    const clause = buildGoalMetClause(study.seriesAfterPrior.goalMet);
    if (clause === null) {
      return null;
    }
    return { text: clause, factIds: [...study.seriesAfterPrior.factIds] };
  }
  if (slot === "goals.diffClause") {
    const clause = buildGoalsDiffClause(study);
    if (!clause) {
      return null;
    }
    const factIds = [
      ...study.goals.prior.flatMap((g) => [g.baseline?.id, g.target?.id]),
      ...study.goals.current.flatMap((g) => [g.baseline?.id, g.target?.id]),
    ].filter((id): id is string => Boolean(id));
    return { text: clause, factIds: [...new Set(factIds)] };
  }
  if (slot === "reeval.summary") {
    const summary = buildReevalSummary(study.reevalMeasures);
    if (!summary) {
      return null;
    }
    const factIds = study.reevalMeasures.flatMap((m) => m.factIds);
    return { text: summary, factIds: [...new Set(factIds)] };
  }
  if (slot === "series.measure") {
    if (!study.seriesAfterPrior) {
      return null;
    }
    return {
      text: study.seriesAfterPrior.measureDisplay,
      factIds: [...study.seriesAfterPrior.factIds],
    };
  }
  if (slot === "series.next.date") {
    if (!study.seriesAfterPrior) {
      return null;
    }
    return {
      text: study.seriesAfterPrior.dateDisplay,
      factIds: [...study.seriesAfterPrior.factIds],
    };
  }
  if (slot === "series.next.value") {
    if (!study.seriesAfterPrior) {
      return null;
    }
    return {
      text: study.seriesAfterPrior.valueDisplay,
      factIds: [...study.seriesAfterPrior.factIds],
    };
  }
  if (slot === "gap.start" || slot === "gap.end") {
    if (!study.recordGap) {
      return null;
    }
    const text = slot === "gap.start" ? study.recordGap.startDisplay : study.recordGap.endDisplay;
    return { text, factIds: [study.recordGap.factId] };
  }
  if (slot === "signal.top.question") {
    if (!study.topSignal) {
      return null;
    }
    return { text: study.topSignal.basis, factIds: [...study.topSignal.factIds] };
  }

  const fact = study.facts[slot];
  if (!fact) {
    return null;
  }
  return {
    text: formatFactForNarrative(block, slot, fact),
    factIds: [fact.id],
  };
}
