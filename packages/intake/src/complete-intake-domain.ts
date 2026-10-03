import type { IntakePackExecutionResult } from "@hiveforyou/domain-pack";

import { resolveIntakeDomain } from "./domain-resolution";
import type { JevDomainDecision } from "./jev-domain-client";
import {
  decideIntakeDomainFromRawIntent,
  inferIntakeDomainFromIdentities,
  isRoutableLocalDomainChoice,
} from "./local-domain-routing";
import { runPackExecutionForIntake } from "./run-pack-execution";
import type {
  DocumentIdentityRecord,
  DocumentNormalizedExtractionRecord,
  IntakeRunRecord,
} from "./types";

export type CompleteIntakeDomainInput = {
  run: IntakeRunRecord;
  identities: DocumentIdentityRecord[];
  filenamesBySourceId: Record<string, string>;
  normalizedBySourceId: Record<string, DocumentNormalizedExtractionRecord>;
  decideDomain?: (rawIntent: string) => Promise<JevDomainDecision>;
};

export type CompleteIntakeDomainResult = {
  run: IntakeRunRecord;
  packExecution: IntakePackExecutionResult | null;
};

export async function completeIntakeDomainPack(
  input: CompleteIntakeDomainInput,
): Promise<CompleteIntakeDomainResult> {
  const rawIntent = input.run.rawIntent?.trim() || null;
  const explicitDomainId = input.run.explicitDomainId?.trim() || null;

  let jevProposal: string | null = input.run.jevDomainProposal;
  let jevConfidence: number | null = input.run.jevDomainConfidence;

  if (!explicitDomainId && rawIntent && input.decideDomain) {
    const decision = await input.decideDomain(rawIntent);
    jevProposal = decision.choice;
    jevConfidence = decision.confidence;
  }

  if (!explicitDomainId && !jevProposal && rawIntent) {
    const local = decideIntakeDomainFromRawIntent(rawIntent);
    if (local && isRoutableLocalDomainChoice(local.choice)) {
      jevProposal = local.choice;
      jevConfidence = local.confidence;
    }
  }

  if (!explicitDomainId && !jevProposal) {
    const fromDocuments = inferIntakeDomainFromIdentities(input.identities);
    if (fromDocuments && isRoutableLocalDomainChoice(fromDocuments.choice)) {
      jevProposal = fromDocuments.choice;
      jevConfidence = fromDocuments.confidence;
    }
  }

  const resolution = resolveIntakeDomain({
    rawIntent,
    explicitDomainId,
    jevDomainProposal: jevProposal,
    jevDomainConfidence: jevConfidence,
  });

  let packExecution: IntakePackExecutionResult | null = null;
  const participatingIdentities = input.identities.filter(
    (identity) => identity.analysisDisposition !== "DISCARDED",
  );

  if (resolution.studyPath === "DOMAIN_PACK" && resolution.resolvedDomainId) {
    const documents = participatingIdentities
      .map((identity) => {
        const normalized = input.normalizedBySourceId[identity.sourceDocumentId];
        if (!normalized) {
          return null;
        }
        return {
          sourceDocumentId: identity.sourceDocumentId,
          filename: input.filenamesBySourceId[identity.sourceDocumentId] ?? "document",
          identity,
          normalized: normalized.normalizedExtraction,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    packExecution = await runPackExecutionForIntake({
      resolvedDomainId: resolution.resolvedDomainId,
      documents,
    });
  }

  const updatedRun: IntakeRunRecord = {
    ...input.run,
    jevDomainProposal: jevProposal,
    jevDomainConfidence: jevConfidence,
    resolvedDomainId: resolution.resolvedDomainId,
    resolutionSource: resolution.resolutionSource,
    studyPath: resolution.studyPath,
    packExecutionJson: packExecution ? JSON.stringify(packExecution) : null,
    updatedAt: new Date().toISOString(),
  };

  return { run: updatedRun, packExecution };
}
