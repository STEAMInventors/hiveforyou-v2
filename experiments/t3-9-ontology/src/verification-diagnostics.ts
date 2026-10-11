import type { ReaderExperimentCandidateFact } from "../../../engine/eval/src/reader-experiment/fact-match.js";

import type { L001DocumentBundle } from "./corpus.js";
import { evidenceQuoteText } from "./evidence-quote.js";
import { createLocalReaderVerifier, type VerifiedProposal } from "./local-verifier.js";

export { evidenceQuoteText } from "./evidence-quote.js";

export type RejectionCategory =
  | "NO_EVIDENCE_SUBMITTED"
  | "SCOPE_OR_PROVENANCE"
  | "DOCUMENT_IDENTITY"
  | "PAGE_BOUNDS"
  | "QUOTE_NO_MATCH"
  | "SPAN_MISMATCH"
  | "OTHER";

export type RejectedCandidateDiagnostic = {
  candidateId: string;
  sourceDocumentId: string | null;
  page: number | null;
  quotePreview: string | null;
  reasons: string[];
  categories: RejectionCategory[];
};

export type VerificationDiagnosticsReport = {
  schemaVersion: "t3-9-ontology/verification-diagnostics/1";
  proposalCount: number;
  candidateCount: number;
  parseDropped: number;
  acceptedCount: number;
  rejectedCount: number;
  rejectionReasonCounts: Record<string, number>;
  rejectionCategoryCounts: Record<RejectionCategory, number>;
  rejected: RejectedCandidateDiagnostic[];
};

export function categorizeVerifierReason(reason: string): RejectionCategory {
  const r = reason.toLowerCase();
  if (r.includes("at least one evidence")) {
    return "NO_EVIDENCE_SUBMITTED";
  }
  if (
    r.includes("not authorized") ||
    r.includes("unknown case") ||
    r.includes("scope mismatch") ||
    r.includes("failed to resolve") ||
    r.includes("evidence reference") ||
    r.includes("provenance")
  ) {
    return "SCOPE_OR_PROVENANCE";
  }
  if (r.includes("document identity mismatch")) {
    return "DOCUMENT_IDENTITY";
  }
  if (r.includes("out of bounds")) {
    return "PAGE_BOUNDS";
  }
  if (r.includes("quote does not match")) {
    return "QUOTE_NO_MATCH";
  }
  if (r.includes("spanstart") || r.includes("spanend")) {
    return "SPAN_MISMATCH";
  }
  return "OTHER";
}

function summarizeCandidate(candidate: ReaderExperimentCandidateFact): Pick<
  RejectedCandidateDiagnostic,
  "sourceDocumentId" | "page" | "quotePreview"
> {
  const ref = candidate.evidenceRefs[0];
  if (!ref) {
    return { sourceDocumentId: null, page: null, quotePreview: null };
  }
  const quote = evidenceQuoteText(ref);
  return {
    sourceDocumentId: ref.sourceDocumentId || null,
    page: ref.page ?? null,
    quotePreview: quote ? quote.slice(0, 120) : null,
  };
}

export function summarizeRejectionCategories(reasons: string[]): RejectionCategory[] {
  const set = new Set<RejectionCategory>();
  for (const reason of reasons) {
    set.add(categorizeVerifierReason(reason));
  }
  return [...set];
}

export function buildVerificationDiagnosticsReport(input: {
  proposals: unknown[];
  candidates: ReaderExperimentCandidateFact[];
  parseDropped: number;
  verified: VerifiedProposal[];
}): VerificationDiagnosticsReport {
  const rejectionReasonCounts: Record<string, number> = {};
  const rejectionCategoryCounts: Record<RejectionCategory, number> = {
    NO_EVIDENCE_SUBMITTED: 0,
    SCOPE_OR_PROVENANCE: 0,
    DOCUMENT_IDENTITY: 0,
    PAGE_BOUNDS: 0,
    QUOTE_NO_MATCH: 0,
    SPAN_MISMATCH: 0,
    OTHER: 0,
  };

  const rejected: RejectedCandidateDiagnostic[] = [];
  let acceptedCount = 0;

  for (const row of input.verified) {
    if (row.accepted) {
      acceptedCount += 1;
      continue;
    }
    for (const reason of row.reasons) {
      rejectionReasonCounts[reason] = (rejectionReasonCounts[reason] ?? 0) + 1;
      const category = categorizeVerifierReason(reason);
      rejectionCategoryCounts[category] += 1;
    }
    rejected.push({
      candidateId: row.candidate.id,
      ...summarizeCandidate(row.candidate),
      reasons: row.reasons,
      categories: summarizeRejectionCategories(row.reasons),
    });
  }

  return {
    schemaVersion: "t3-9-ontology/verification-diagnostics/1",
    proposalCount: input.proposals.length,
    candidateCount: input.candidates.length,
    parseDropped: input.parseDropped,
    acceptedCount,
    rejectedCount: rejected.length,
    rejectionReasonCounts,
    rejectionCategoryCounts,
    rejected,
  };
}

export async function verifyAllWithDiagnostics(
  bundles: L001DocumentBundle[],
  candidates: ReaderExperimentCandidateFact[],
): Promise<{ accepted: ReaderExperimentCandidateFact[]; verified: VerifiedProposal[] }> {
  const verifier = createLocalReaderVerifier(bundles);
  const accepted: ReaderExperimentCandidateFact[] = [];
  const verified: VerifiedProposal[] = [];
  for (const candidate of candidates) {
    const result = await verifier.verifyCandidate(candidate);
    verified.push(result);
    if (result.accepted) {
      accepted.push(candidate);
    }
  }
  return { accepted, verified };
}
