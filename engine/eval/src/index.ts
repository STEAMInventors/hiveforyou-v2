export type {
  CertifiedGoldenCase,
  DraftGoldenCase,
  GoldenCase,
  GoldenFact,
  GoldenFactValue,
  GoldenFactValueKind,
  GoldenGap,
  GoldenSplit,
  GoldenTripwire,
  GoldenWordRange,
} from "./golden/types.js";
export {
  GOLDEN_SPLITS,
  isCertifiedGoldenCase,
  isDraftGoldenCase,
} from "./golden/types.js";
export {
  assertGoldenSplit,
  parseGapKind,
  parseGoldenFactModalities,
  validateGoldenCase,
  type GoldenValidationIssue,
} from "./golden/validate.js";
export {
  assertCertifiedGolden,
  claimValuesEquivalent,
  gradeGoldenProposal,
  GoldenNotCertifiedError,
  modalityAcceptable,
  type GradeCorpusContext,
  type GradeFailure,
  type GradeFailureKind,
  type GradeFeedbackByKind,
  type GradeFeedbackExample,
  type GradeMetrics,
  type GradeResult,
} from "./grade.js";
