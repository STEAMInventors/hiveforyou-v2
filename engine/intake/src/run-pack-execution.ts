import {
  getDiscoverPackByDomainId,
  getIntakePackExecutor,
  type IntakePackExecutionResult,
} from "@hiveforyou/domain-pack";
import type { NormalizedDocumentExtraction } from "@hiveforyou/shared/intake";

import type { DocumentIdentityRecord } from "./types";

export async function runPackExecutionForIntake(input: {
  resolvedDomainId: string;
  documents: Array<{
    sourceDocumentId: string;
    filename: string;
    identity: DocumentIdentityRecord;
    normalized: NormalizedDocumentExtraction;
  }>;
}): Promise<IntakePackExecutionResult | null> {
  const executor = getIntakePackExecutor(input.resolvedDomainId);
  const discover = getDiscoverPackByDomainId(input.resolvedDomainId);
  if (!executor || !discover) {
    return null;
  }
  return await Promise.resolve(
    executor.execute({
      domainPackId: discover.domainPackId,
      domainPackVersion: discover.domainPackVersion,
      documents: input.documents.map((doc) => ({
        sourceDocumentId: doc.sourceDocumentId,
        filename: doc.filename,
        genericIdentity: doc.identity.proposedType,
        normalized: doc.normalized,
      })),
      missingExpectations: discover.missingExpectations,
    }),
  );
}
