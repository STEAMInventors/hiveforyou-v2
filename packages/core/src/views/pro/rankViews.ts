import type { ProViewWeights } from "@hiveforyou/domain-pack";
import type { Study } from "@hiveforyou/shared/pack-study";

export type ProViewId = "brief" | "side" | "trends" | "ledger";

export type RankedProView = {
  id: ProViewId;
  score: number;
  why: string;
};

const VIEW_ORDER: ProViewId[] = ["brief", "side", "trends", "ledger"];

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function studyCounts(study: Study) {
  const signals = study.rankedSignals.length;
  const comparisons = study.slotComparisons.length;
  const changes = study.slotComparisons.filter((c) =>
    ["changed", "added", "dropped"].includes(c.state),
  ).length;
  const sections = new Set(study.slotComparisons.map((c) => c.sectionId)).size;
  const series = study.measureSeries.length;
  const gaps = study.recordGaps.length;
  const facts = Object.keys(study.facts).length;
  return { signals, comparisons, changes, sections, series, gaps, facts };
}

export function rankViews(study: Study, weights: ProViewWeights): RankedProView[] {
  const c = studyCounts(study);

  const scored: RankedProView[] = [
    {
      id: "brief",
      score: c.signals ? weights.briefBase + c.signals * weights.briefPerSignal : 0,
      why:
        c.signals > 0
          ? `${plural(c.signals, "ranked signal")} and ${plural(c.changes, "change")} to raise`
          : "No signals in this case",
    },
    {
      id: "side",
      score: c.comparisons ? weights.sideBase + c.changes * weights.sidePerChange : 0,
      why: `${plural(c.comparisons, "item")} compared across ${plural(c.sections, "section")}`,
    },
    {
      id: "trends",
      score: c.series * weights.trendsPerSeries + c.gaps * weights.trendsPerGap,
      why: `${plural(c.series, "measure")} over time and ${plural(c.gaps, "record gap")}`,
    },
    {
      id: "ledger",
      score: weights.ledgerBase + c.facts * weights.ledgerPerFact,
      why: `${plural(c.facts, "fact")}, each with its quote`,
    },
  ];

  return scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return VIEW_ORDER.indexOf(a.id) - VIEW_ORDER.indexOf(b.id);
  });
}
