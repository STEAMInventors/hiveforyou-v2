import type { ReaderExperimentCandidateFact } from "../../../engine/eval/src/reader-experiment/fact-match.js";
import {
  verifyReaderFact,
  type ReaderFactVerifyInput,
} from "../../../worker/src/verifier/verify-reader-fact.js";

import type { L001DocumentBundle } from "./corpus.js";

const EXPERIMENT_CASE_ID = "pack-driven-reader-l001";
const EXPERIMENT_USER_ID = "pack-driven-reader-l001-local";

export type VerifiedField = {
  candidate: ReaderExperimentCandidateFact;
  accepted: boolean;
  reasons: string[];
};

export function createLocalReaderVerifier(bundles: L001DocumentBundle[]) {
  const pagesBySourceId = new Map(bundles.map((b) => [b.sourceDocumentId, b.documentPages]));
  const authorizedSourceDocumentIds = bundles.map((b) => b.sourceDocumentId);

  const deps = {
    resolveScope: async (caseId: string, userId: string) => {
      if (caseId !== EXPERIMENT_CASE_ID || userId !== EXPERIMENT_USER_ID) {
        return null;
      }
      return {
        caseId,
        userId,
        domainId: "iep",
        authorizedSourceDocumentIds,
      };
    },
    loadDocumentPages: async (_userId: string, sourceDocumentId: string) => {
      return pagesBySourceId.get(sourceDocumentId) ?? null;
    },
  };

  return {
    verifyCandidate: async (candidate: ReaderExperimentCandidateFact): Promise<VerifiedField> => {
      const evidence: ReaderFactVerifyInput["evidence"] = [];
      for (const ref of candidate.evidenceRefs) {
        const quote = ref.quote?.trim() ?? "";
        if (!ref.sourceDocumentId || ref.page == null || !quote) {
          continue;
        }
        evidence.push({
          sourceDocumentId: ref.sourceDocumentId,
          page: ref.page,
          quote,
          spanStart: ref.spanStart,
          spanEnd: ref.spanEnd,
        });
      }
      const result = await verifyReaderFact(
        {
          caseId: EXPERIMENT_CASE_ID,
          userId: EXPERIMENT_USER_ID,
          evidence,
        },
        deps,
      );
      return { candidate, accepted: result.accepted, reasons: result.reasons };
    },
  };
}
