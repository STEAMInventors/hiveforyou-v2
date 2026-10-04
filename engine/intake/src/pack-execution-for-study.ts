import {
  INTAKE_PACK_EXECUTION_SCHEMA_VERSION,
  type IntakePackExecutionResult,
} from "@hiveforyou/domain-pack";
import type { NormalizedDocumentExtraction } from "@hiveforyou/shared/intake";

import { runPackExecutionForIntake } from "./run-pack-execution";
import type { DocumentIdentityRecord } from "./types";

export function parsePackExecution(raw: string | null): IntakePackExecutionResult | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as IntakePackExecutionResult;
    if (parsed.schemaVersion !== INTAKE_PACK_EXECUTION_SCHEMA_VERSION) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export type RefreshPackExecutionForStudyInput = {
  resolvedDomainId: string;
  identities: DocumentIdentityRecord[];
  sources: Array<{ id: string; originalFilename: string; sha256: string }>;
  loadNormalized: (
    sourceDocumentId: string,
    sourceHash: string,
  ) => Promise<NormalizedDocumentExtraction | null>;
  onRefreshFailed?: (info: { message: string }) => void;
};

/**
 * Re-run pack execution from stored page text so plan dates and current/prior
 * roles are attached even when the persisted execution predates that step.
 */
export async function refreshPackExecutionForStudy(
  input: RefreshPackExecutionForStudyInput,
): Promise<IntakePackExecutionResult | null> {
  const documents = [];
  for (const identity of input.identities) {
    if (identity.analysisDisposition === "DISCARDED") {
      continue;
    }
    const source = input.sources.find((row) => row.id === identity.sourceDocumentId);
    if (!source?.sha256) {
      continue;
    }
    const normalized = await input.loadNormalized(identity.sourceDocumentId, source.sha256);
    if (!normalized) {
      continue;
    }
    documents.push({
      sourceDocumentId: identity.sourceDocumentId,
      filename: source.originalFilename,
      identity,
      normalized,
    });
  }
  if (!documents.length) {
    return null;
  }
  try {
    return await runPackExecutionForIntake({
      resolvedDomainId: input.resolvedDomainId,
      documents,
    });
  } catch (error) {
    input.onRefreshFailed?.({
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
