import type { GoldenCase } from "../../../engine/eval/src/index.js";
import type { GradeCorpusContext } from "../../../engine/eval/src/index.js";
import { buildReaderGoldenComparisonReport } from "../../../engine/eval/src/reader-experiment/fact-match.js";
import type { ReaderExperimentCandidateFact } from "../../../engine/eval/src/reader-experiment/fact-match.js";

/** Page 3 carries two distinct golden targets on overlapping text (addresses vs goal area). */
export const PAGE3_GOLDEN_PAIR = ["clm_iep_addresses", "clm_goal_area"] as const;

export type Page3Reconciliation = {
  goldenTargets: typeof PAGE3_GOLDEN_PAIR;
  acceptedProposalCountOnPage3: number;
  goldenMatched: Record<string, boolean>;
  notes: string;
};

export function reconcilePage3GoldenTargets(input: {
  golden: GoldenCase;
  corpus: GradeCorpusContext;
  accepted: ReaderExperimentCandidateFact[];
}): Page3Reconciliation {
  const slice: GoldenCase = {
    ...input.golden,
    facts: input.golden.facts.filter((f) => (PAGE3_GOLDEN_PAIR as readonly string[]).includes(f.id)),
  };
  const report = buildReaderGoldenComparisonReport({
    golden: slice,
    candidates: input.accepted,
    corpus: input.corpus,
    verificationIncomplete: false,
  });
  const goldenMatched = Object.fromEntries(
    report.perGoldenFact.map((row) => [row.goldenFactId, row.status === "matched"]),
  ) as Record<string, boolean>;

  return {
    goldenTargets: PAGE3_GOLDEN_PAIR,
    acceptedProposalCountOnPage3: input.accepted.filter((c) =>
      c.evidenceRefs.some((ref) => ref.page === 3),
    ).length,
    goldenMatched,
    notes:
      "Golden page-3 pair shares word span [13,22) for clm_iep_addresses and clm_goal_area; reconcile coverage separately from raw accepted counts.",
  };
}
