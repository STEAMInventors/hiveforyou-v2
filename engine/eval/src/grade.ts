import {
  mapV4EvidenceRefToWordRange,
  wordRangesOverlap,
  type PageWordRange,
} from "@hiveforyou/core/atoms/map-v4-evidence";
import type { PageModel } from "@hiveforyou/core/document/page-model";
import type {
  CanonicalStudyProposalV4,
  ClaimModality,
  ClaimValueV4,
  EvidenceReferenceV4,
  ProposedClaimV4,
  ProposedMissingInformationV4,
} from "@hiveforyou/shared/case-intelligence/4";
import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";

import {
  isCertifiedGoldenCase,
  isDraftGoldenCase,
  type GoldenCase,
  type GoldenFact,
  type GoldenGap,
} from "./golden/types.js";

export type GradeFailureKind =
  | "MISSED_FACT"
  | "UNSUPPORTED_CLAIM"
  | "VALUE_MISMATCH"
  | "WRONG_ABSTENTION"
  | "TRIPWIRE_FIRED"
  | "INVARIANT_BROKEN";

export const FAILURE_KIND_ORDER: GradeFailureKind[] = [
  "MISSED_FACT",
  "UNSUPPORTED_CLAIM",
  "VALUE_MISMATCH",
  "WRONG_ABSTENTION",
  "TRIPWIRE_FIRED",
  "INVARIANT_BROKEN",
];

export type GradeFailure = {
  kind: GradeFailureKind;
  message: string;
  goldenFactId?: string;
  claimId?: string;
  gapId?: string;
  tripwireId?: string;
  expectedPage?: number;
  expectedQuote?: string;
  foundPage?: number;
  foundQuote?: string;
};

export type GradeMetrics = {
  /** matchedCandidateClaims / candidateClaimCount; zero candidates + zero golden facts => 1; zero candidates + expected facts => 0 */
  precision: number;
  recall: number;
  abstention: number;
  provenance: number;
  invariants: number;
};

export type GradeFeedbackExample = {
  message: string;
  expectedPage?: number;
  expectedQuote?: string;
  foundPage?: number;
  foundQuote?: string;
};

export type GradeFeedbackByKind = {
  kind: GradeFailureKind;
  count: number;
  examples: GradeFeedbackExample[];
};

export type GradeResult = {
  score: number;
  metrics: GradeMetrics;
  failures: GradeFailure[];
  feedback: GradeFeedbackByKind[];
};

export type GradeCorpusContext = {
  pageModelsByDocumentId: Map<string, PageModel[]>;
  recoveredPagesByDocumentId: Map<string, NestIepRecoveredPage[]>;
  sourceDocumentIdToDocumentId?: Map<string, string>;
};

export class GoldenNotCertifiedError extends Error {
  readonly code = "GOLDEN_NOT_CERTIFIED" as const;

  constructor(message: string) {
    super(message);
    this.name = "GoldenNotCertifiedError";
  }
}

export function assertCertifiedGolden(golden: GoldenCase): asserts golden is GoldenCase & { verifiedBy: string } {
  if (!isCertifiedGoldenCase(golden) || isDraftGoldenCase(golden)) {
    throw new GoldenNotCertifiedError(
      "Refusing to grade: golden must be certified (non-empty verifiedBy, draft not true).",
    );
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) {
    return 0;
  }
  return Math.min(1, Math.max(0, n));
}

function goldenToPageWordRange(fact: GoldenFact): PageWordRange {
  return {
    documentId: fact.documentId,
    pageNumber: fact.pageNumber,
    wordStart: fact.wordRange[0],
    wordEnd: fact.wordRange[1],
  };
}

export function claimValuesEquivalent(a: ClaimValueV4, b: ClaimValueV4): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case "text":
      return b.kind === "text" && a.textValue === b.textValue;
    case "code":
      return b.kind === "code" && a.codeValue === b.codeValue;
    case "boolean":
      return b.kind === "boolean" && a.booleanValue === b.booleanValue;
    case "entity_ref":
      return b.kind === "entity_ref" && a.entityId === b.entityId;
    case "date":
      return b.kind === "date" && a.dateValue === b.dateValue;
    case "period":
      return b.kind === "period" && a.periodStart === b.periodStart && a.periodEnd === b.periodEnd;
    case "quantity":
      return (
        b.kind === "quantity" &&
        a.numberValue === b.numberValue &&
        (a.unit ?? null) === (b.unit ?? null)
      );
    case "unknown":
      return true;
    default:
      return false;
  }
}

function resolveDocumentId(sourceDocumentId: string, context: GradeCorpusContext): string | null {
  const mapped = context.sourceDocumentIdToDocumentId?.get(sourceDocumentId);
  if (mapped) {
    return mapped;
  }
  if (context.pageModelsByDocumentId.has(sourceDocumentId)) {
    return sourceDocumentId;
  }
  return null;
}

function resolveEvidenceRefToWordRange(
  ref: EvidenceReferenceV4,
  context: GradeCorpusContext,
): PageWordRange | null {
  const documentId = resolveDocumentId(ref.sourceDocumentId, context);
  if (!documentId) {
    return null;
  }
  const pageNumber = ref.page ?? 1;
  const pageModel = context.pageModelsByDocumentId.get(documentId)?.find((p) => p.pageNumber === pageNumber);
  const recoveredPage = context.recoveredPagesByDocumentId.get(documentId)?.find((p) => p.pageNumber === pageNumber);
  if (!pageModel || !recoveredPage) {
    return null;
  }
  const quote = ref.quote?.trim() ?? "";
  if (!quote) {
    return null;
  }
  return mapV4EvidenceRefToWordRange({
    documentId,
    recoveredPage,
    pageModel,
    ref: {
      sourceDocumentId: ref.sourceDocumentId,
      page: pageNumber,
      extractionId: ref.extractionId,
      snippet: quote,
    },
  });
}

function quoteFromPageModel(pageModel: PageModel | undefined, range: PageWordRange): string | undefined {
  if (!pageModel) {
    return undefined;
  }
  const words = pageModel.words.slice(range.wordStart, range.wordEnd);
  if (!words.length) {
    return undefined;
  }
  return words.map((w) => w.text).join(" ");
}

type OverlapLink = {
  goldenFactId: string;
  claimId: string;
  valueMatch: boolean;
  modalityOk: boolean;
};

function collectOverlapLinks(
  golden: GoldenCase,
  claims: ProposedClaimV4[],
  context: GradeCorpusContext,
): OverlapLink[] {
  const links: OverlapLink[] = [];
  for (const fact of [...golden.facts].sort((x, y) => x.id.localeCompare(y.id))) {
    const factRange = goldenToPageWordRange(fact);
    for (const claim of [...claims].sort((x, y) => x.id.localeCompare(y.id))) {
      let overlaps = false;
      for (const ref of claim.evidenceRefs) {
        const refRange = resolveEvidenceRefToWordRange(ref, context);
        if (refRange && wordRangesOverlap(factRange, refRange)) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        continue;
      }
      links.push({
        goldenFactId: fact.id,
        claimId: claim.id,
        valueMatch: claimValuesEquivalent(claim.value, fact.value),
        modalityOk: fact.acceptableModalities.includes(claim.modality),
      });
    }
  }
  return links;
}

function evaluateTripwires(golden: GoldenCase, proposal: CanonicalStudyProposalV4): GradeFailure[] {
  const failures: GradeFailure[] = [];
  for (const tw of [...golden.tripwires].sort((a, b) => a.id.localeCompare(b.id))) {
    const token = tw.mustNotClaim.trim();
    let fired = false;
    let detail = "";
    if (token === "conflict") {
      fired = proposal.conflicts.length > 0;
      detail = fired ? `${proposal.conflicts.length} conflict(s) present` : "";
    } else if (token.startsWith("conflict:")) {
      const suffix = token.slice("conflict:".length);
      const hit = proposal.conflicts.find((c) => c.id === suffix || c.id.includes(suffix));
      fired = Boolean(hit);
      detail = hit ? `conflict id ${hit.id}` : "";
    } else if (token.startsWith("gap:")) {
      const suffix = token.slice("gap:".length);
      const hit = proposal.missingInformation.find((m) => m.id === suffix || m.id.includes(suffix));
      fired = Boolean(hit);
      detail = hit ? `missingInformation id ${hit.id}` : "";
    } else {
      fired =
        proposal.conflicts.some((c) => c.id.includes(token)) ||
        proposal.missingInformation.some((m) => m.id.includes(token)) ||
        proposal.claims.some((c) => c.id.includes(token));
      detail = fired ? `matched token ${token}` : "";
    }
    if (fired) {
      failures.push({
        kind: "TRIPWIRE_FIRED",
        tripwireId: tw.id,
        message: `Tripwire ${tw.id} fired (${token})${detail ? `: ${detail}` : ""}`,
      });
    }
  }
  return failures;
}

/** Deterministic prose normalization for zero-anchor golden gaps (no labelWordRange on golden). */
function normalizeGapDescription(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function evidenceRefOverlapsGoldenLabel(
  ref: EvidenceReferenceV4,
  labelWordRange: GoldenGap["labelWordRange"],
  context: GradeCorpusContext,
): boolean {
  if (!labelWordRange) {
    return false;
  }
  const [start, end] = labelWordRange;
  const refRange = resolveEvidenceRefToWordRange(ref, context);
  if (!refRange) {
    return false;
  }
  return refRange.wordStart < end && start < refRange.wordEnd;
}

/**
 * Match golden gaps to candidate missingInformation by provenance — never by proposal id.
 * Anchored gaps: gapKind + evidence word-range overlap with labelWordRange.
 * Zero-anchor gaps: gapKind + normalized description equality (golden schema has no subject/construct anchor).
 */
function candidateMatchesGoldenGap(
  missing: ProposedMissingInformationV4,
  gap: GoldenGap,
  context: GradeCorpusContext,
): boolean {
  if (missing.gapKind !== gap.gapKind) {
    return false;
  }
  if (gap.labelWordRange) {
    const refs = missing.evidenceRefs ?? [];
    if (!refs.length) {
      return false;
    }
    return refs.some((ref) => evidenceRefOverlapsGoldenLabel(ref, gap.labelWordRange, context));
  }
  return normalizeGapDescription(missing.description) === normalizeGapDescription(gap.description);
}

function gapMissingInProposal(
  gap: GoldenGap,
  proposal: CanonicalStudyProposalV4,
  context: GradeCorpusContext,
): boolean {
  return !proposal.missingInformation.some((m) => candidateMatchesGoldenGap(m, gap, context));
}

function claimOverlapsGapLabel(claim: ProposedClaimV4, gap: GoldenGap, context: GradeCorpusContext): boolean {
  if (!gap.labelWordRange) {
    return false;
  }
  for (const ref of claim.evidenceRefs) {
    if (evidenceRefOverlapsGoldenLabel(ref, gap.labelWordRange, context)) {
      return true;
    }
  }
  return false;
}
function evaluateInvariants(proposal: CanonicalStudyProposalV4, context: GradeCorpusContext): GradeFailure[] {
  const failures: GradeFailure[] = [];
  for (const claim of [...proposal.claims].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!claim.evidenceRefs.length) {
      failures.push({
        kind: "INVARIANT_BROKEN",
        claimId: claim.id,
        message: `Claim ${claim.id} has no evidence references.`,
      });
      continue;
    }
    if (!claim.evidenceRefs.some((ref) => resolveEvidenceRefToWordRange(ref, context))) {
      const primary = claim.evidenceRefs[0];
      failures.push({
        kind: "INVARIANT_BROKEN",
        claimId: claim.id,
        message: `Claim ${claim.id} has no resolvable evidence word-range in corpus.`,
        foundPage: primary?.page,
        foundQuote: primary?.quote,
      });
    }
  }
  return failures;
}

function failureKey(f: GradeFailure): string {
  return `${f.kind}:${f.goldenFactId ?? ""}:${f.claimId ?? ""}:${f.gapId ?? ""}:${f.tripwireId ?? ""}:${f.message}`;
}

function buildFeedback(failures: GradeFailure[]): GradeFeedbackByKind[] {
  const feedback: GradeFeedbackByKind[] = [];
  for (const kind of FAILURE_KIND_ORDER) {
    const group = failures.filter((f) => f.kind === kind);
    if (!group.length) {
      continue;
    }
    const sorted = [...group].sort((a, b) => failureKey(a).localeCompare(failureKey(b)));
    feedback.push({
      kind,
      count: sorted.length,
      examples: sorted.slice(0, 5).map((f) => ({
        message: f.message,
        expectedPage: f.expectedPage,
        expectedQuote: f.expectedQuote,
        foundPage: f.foundPage,
        foundQuote: f.foundQuote,
      })),
    });
  }
  return feedback;
}

function sortFailures(failures: GradeFailure[]): GradeFailure[] {
  return [...failures].sort((a, b) => {
    const kindDiff = FAILURE_KIND_ORDER.indexOf(a.kind) - FAILURE_KIND_ORDER.indexOf(b.kind);
    return kindDiff !== 0 ? kindDiff : failureKey(a).localeCompare(failureKey(b));
  });
}

export function gradeGoldenProposal(input: {
  golden: GoldenCase;
  proposal: CanonicalStudyProposalV4;
  corpus: GradeCorpusContext;
}): GradeResult {
  assertCertifiedGolden(input.golden);
  const { golden, proposal, corpus } = input;
  const failures: GradeFailure[] = [];
  failures.push(...evaluateTripwires(golden, proposal));
  failures.push(...evaluateInvariants(proposal, corpus));

  const links = collectOverlapLinks(golden, proposal.claims, corpus);
  const matchedFactIds = new Set<string>();
  const matchedClaimIds = new Set<string>();
  for (const link of links.filter((l) => l.valueMatch && l.modalityOk).sort((a, b) => {
    const f = a.goldenFactId.localeCompare(b.goldenFactId);
    return f !== 0 ? f : a.claimId.localeCompare(b.claimId);
  })) {
    if (matchedFactIds.has(link.goldenFactId) || matchedClaimIds.has(link.claimId)) {
      continue;
    }
    matchedFactIds.add(link.goldenFactId);
    matchedClaimIds.add(link.claimId);
  }

  for (const fact of [...golden.facts].sort((a, b) => a.id.localeCompare(b.id))) {
    if (matchedFactIds.has(fact.id)) {
      continue;
    }
    const factRange = goldenToPageWordRange(fact);
    const pageModel = corpus.pageModelsByDocumentId.get(fact.documentId)?.find((p) => p.pageNumber === fact.pageNumber);
    failures.push({
      kind: "MISSED_FACT",
      goldenFactId: fact.id,
      message: `Golden fact ${fact.id} has no acceptable candidate match (overlap, value, modality).`,
      expectedPage: fact.pageNumber,
      expectedQuote: quoteFromPageModel(pageModel, factRange),
    });
  }

  for (const claim of [...proposal.claims].sort((a, b) => a.id.localeCompare(b.id))) {
    if (matchedClaimIds.has(claim.id)) {
      continue;
    }
    const claimLinks = links.filter((l) => l.claimId === claim.id);
    const valueMismatch = claimLinks.find((l) => !l.valueMatch);
    if (valueMismatch) {
      const fact = golden.facts.find((f) => f.id === valueMismatch.goldenFactId);
      const factRange = fact ? goldenToPageWordRange(fact) : undefined;
      const pageModel =
        fact && corpus.pageModelsByDocumentId.get(fact.documentId)?.find((p) => p.pageNumber === fact.pageNumber);
      const primary = claim.evidenceRefs[0];
      failures.push({
        kind: "VALUE_MISMATCH",
        goldenFactId: valueMismatch.goldenFactId,
        claimId: claim.id,
        message: `Claim ${claim.id} overlaps golden fact ${valueMismatch.goldenFactId} but value differs.`,
        expectedPage: fact?.pageNumber,
        expectedQuote: factRange ? quoteFromPageModel(pageModel, factRange) : undefined,
        foundPage: primary?.page,
        foundQuote: primary?.quote,
      });
      continue;
    }
    const modalityOnly = claimLinks.find((l) => l.valueMatch && !l.modalityOk);
    if (modalityOnly) {
      const fact = golden.facts.find((f) => f.id === modalityOnly.goldenFactId);
      failures.push({
        kind: "UNSUPPORTED_CLAIM",
        goldenFactId: modalityOnly.goldenFactId,
        claimId: claim.id,
        message: `Claim ${claim.id} matches provenance and value for ${modalityOnly.goldenFactId} but modality ${claim.modality} is not acceptable (expected: ${fact?.acceptableModalities.join(", ")}).`,
        foundPage: claim.evidenceRefs[0]?.page,
        foundQuote: claim.evidenceRefs[0]?.quote,
      });
      continue;
    }
    failures.push({
      kind: "UNSUPPORTED_CLAIM",
      claimId: claim.id,
      message: `Claim ${claim.id} is not grounded to any golden fact by evidence overlap and value.`,
      foundPage: claim.evidenceRefs[0]?.page,
      foundQuote: claim.evidenceRefs[0]?.quote,
    });
  }

  for (const gap of [...golden.gaps].sort((a, b) => a.id.localeCompare(b.id))) {
    if (gapMissingInProposal(gap, proposal, corpus)) {
      failures.push({
        kind: "WRONG_ABSTENTION",
        gapId: gap.id,
        message: `Expected missingInformation for golden gap ${gap.id} was not reported.`,
      });
    }
    for (const claim of proposal.claims) {
      if (claimOverlapsGapLabel(claim, gap, corpus)) {
        failures.push({
          kind: "WRONG_ABSTENTION",
          gapId: gap.id,
          claimId: claim.id,
          message: `Claim ${claim.id} asserts a fact where golden gap ${gap.id} expects abstention.`,
          foundPage: claim.evidenceRefs[0]?.page,
          foundQuote: claim.evidenceRefs[0]?.quote,
        });
      }
    }
  }

  const deduped = sortFailures(failures.filter((f, i, arr) => arr.findIndex((x) => failureKey(x) === failureKey(f)) === i));

  const totalClaims = proposal.claims.length;
  const totalFacts = golden.facts.length;
  const totalGaps = golden.gaps.length;
  // score = 0.5 * precision + 0.3 * recall + 0.2 * abstention (tripwire => score 0)
  let precision;
  if (totalClaims > 0) {
    precision = matchedClaimIds.size / totalClaims;
  } else if (totalFacts === 0) {
    precision = 1;
  } else {
    precision = 0;
  }
  const recall = totalFacts === 0 ? 1 : matchedFactIds.size / totalFacts;
  const gapsCorrect = golden.gaps.filter((g) => !gapMissingInProposal(g, proposal, corpus)).length;
  const abstention = totalGaps === 0 ? 1 : gapsCorrect / totalGaps;
  let claimsWithProvenance = 0;
  for (const claim of proposal.claims) {
    if (claim.evidenceRefs.some((ref) => resolveEvidenceRefToWordRange(ref, corpus))) {
      claimsWithProvenance += 1;
    }
  }
  const provenance = totalClaims === 0 ? 1 : claimsWithProvenance / totalClaims;
  const invariants = deduped.some((f) => f.kind === "INVARIANT_BROKEN") ? 0 : 1;
  const tripwireFired = deduped.some((f) => f.kind === "TRIPWIRE_FIRED");
  const score = tripwireFired ? 0 : clamp01(0.5 * precision + 0.3 * recall + 0.2 * abstention);

  return {
    score,
    metrics: {
      precision: clamp01(precision),
      recall: clamp01(recall),
      abstention: clamp01(abstention),
      provenance: clamp01(provenance),
      invariants,
    },
    failures: deduped,
    feedback: buildFeedback(deduped),
  };
}

export function modalityAcceptable(fact: GoldenFact, modality: ClaimModality): boolean {
  return fact.acceptableModalities.includes(modality);
}
