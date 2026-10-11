import type { GoldenCase } from "../../../engine/eval/src/index.js";
import {
  buildReaderGoldenComparisonReport,
  gradeReaderFactsAgainstGolden,
  type ReaderExperimentCandidateFact,
} from "../../../engine/eval/src/reader-experiment/fact-match.js";
import type { GradeCorpusContext } from "../../../engine/eval/src/index.js";

import { initialIepGoldenFacts } from "./load-catalog.js";
import { reconcilePage3GoldenTargets } from "./page3-reconcile.js";

export type ModeRunMetrics = {
  proposed: number;
  accepted: number;
  rejected: number;
  precision: number;
  recall: number;
  exactModalityMatches: number;
  evidenceAlignment: {
    quoteMappedToWordRangeCount: number;
    goldenRangeOverlapCount: number;
  };
  tokenUse: {
    inputTokens: number;
    outputTokens: number;
  };
  estimatedCostUsd: number;
  elapsedMs: number;
  fullCase: {
    goldenFactCount: number;
    matchedGoldenCount: number;
  };
  initialIep29: {
    goldenFactCount: number;
    matchedGoldenCount: number;
    precision: number;
    recall: number;
  };
  page3Reconciliation: ReturnType<typeof reconcilePage3GoldenTargets>;
};

export function gradeAcceptedFacts(input: {
  golden: GoldenCase;
  corpus: GradeCorpusContext;
  accepted: ReaderExperimentCandidateFact[];
}): {
  fullCaseReport: ReturnType<typeof buildReaderGoldenComparisonReport>;
  initialIepReport: ReturnType<typeof buildReaderGoldenComparisonReport>;
  exactModalityMatches: number;
} {
  const fullCaseReport = buildReaderGoldenComparisonReport({
    golden: input.golden,
    candidates: input.accepted,
    corpus: input.corpus,
    verificationIncomplete: false,
  });

  const initialFacts = initialIepGoldenFacts(input.golden);
  const initialGolden: GoldenCase = { ...input.golden, facts: initialFacts };
  const initialIepReport = buildReaderGoldenComparisonReport({
    golden: initialGolden,
    candidates: input.accepted,
    corpus: input.corpus,
    verificationIncomplete: false,
  });

  const exactModalityMatches = fullCaseReport.perGoldenFact.filter(
    (row) => row.status === "matched",
  ).length;

  return { fullCaseReport, initialIepReport, exactModalityMatches };
}

export function summarizeModeMetrics(input: {
  golden: GoldenCase;
  corpus: GradeCorpusContext;
  proposed: number;
  accepted: ReaderExperimentCandidateFact[];
  rejected: number;
  tokenUse: { inputTokens: number; outputTokens: number };
  estimatedCostUsd: number;
  elapsedMs: number;
}): ModeRunMetrics {
  const { fullCaseReport, initialIepReport, exactModalityMatches } = gradeAcceptedFacts({
    golden: input.golden,
    corpus: input.corpus,
    accepted: input.accepted,
  });

  const initialIepMetrics = gradeReaderFactsAgainstGolden({
    golden: { ...input.golden, facts: initialIepGoldenFacts(input.golden) },
    candidates: input.accepted,
    corpus: input.corpus,
    verificationIncomplete: false,
  });

  return {
    proposed: input.proposed,
    accepted: input.accepted.length,
    rejected: input.rejected,
    precision: fullCaseReport.summary.precision,
    recall: fullCaseReport.summary.recall,
    exactModalityMatches,
    evidenceAlignment: {
      quoteMappedToWordRangeCount: fullCaseReport.matchDiagnostics.quoteMappedToWordRangeCount,
      goldenRangeOverlapCount: fullCaseReport.matchDiagnostics.goldenRangeOverlapCount,
    },
    tokenUse: input.tokenUse,
    estimatedCostUsd: input.estimatedCostUsd,
    elapsedMs: input.elapsedMs,
    fullCase: {
      goldenFactCount: fullCaseReport.summary.goldenFactCount,
      matchedGoldenCount: fullCaseReport.summary.matchedGoldenCount,
    },
    initialIep29: {
      goldenFactCount: initialIepReport.summary.goldenFactCount,
      matchedGoldenCount: initialIepReport.summary.matchedGoldenCount,
      precision: initialIepMetrics.precision,
      recall: initialIepMetrics.recall,
    },
    page3Reconciliation: reconcilePage3GoldenTargets({
      golden: input.golden,
      corpus: input.corpus,
      accepted: input.accepted,
    }),
  };
}
