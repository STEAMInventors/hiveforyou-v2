import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";

import { hashCanonicalJson } from "./fingerprint";
import type {
  ObservedReaderIdentitySummary,
  ReaderPreflightSnapshot,
} from "./reader-engine-identity";

export type { ObservedReaderIdentitySummary, ReaderPreflightSnapshot } from "./reader-engine-identity";

export type StudyArtifactSaveInput = {
  rawProposalJson: unknown | null;
  validationResultJson: CanonicalStudyValidationResultV3;
};

export type StudyArtifactSaveDecision =
  | { action: "insert" }
  | { action: "noop" }
  | { action: "updateValidation"; validationResultJson: CanonicalStudyValidationResultV3 };

export class StudyArtifactContentMismatchError extends Error {
  readonly errorCode = "STUDY_ARTIFACT_CONTENT_MISMATCH" as const;

  constructor(
    message: string,
    readonly existingFingerprint: string,
    readonly incomingFingerprint: string,
  ) {
    super(message);
    this.name = "StudyArtifactContentMismatchError";
  }
}

export function fingerprintStudyArtifactContent(input: StudyArtifactSaveInput): string {
  return hashCanonicalJson({
    rawProposalJson: input.rawProposalJson,
    validationResultJson: input.validationResultJson,
  });
}

export function fingerprintStudyArtifactProposal(rawProposalJson: unknown | null): string {
  return hashCanonicalJson({ rawProposalJson });
}

export function fingerprintStudyArtifactValidation(
  validationResultJson: CanonicalStudyValidationResultV3,
): string {
  return hashCanonicalJson({ validationResultJson });
}

/** Placeholder written by runStudyWorkerProposeStep before validation runs. */
export function createStudyArtifactProposePlaceholderValidation(): CanonicalStudyValidationResultV3 {
  return {
    status: "FAILED",
    accepted: { entities: [], claims: [], conflicts: [], missingInformation: [] },
    rejected: [],
    warnings: [],
    unresolved: [],
    validationErrors: [],
    provenanceErrors: [],
    integrityErrors: [],
  };
}

export function isStudyArtifactProposePlaceholder(
  validation: CanonicalStudyValidationResultV3,
): boolean {
  return (
    validation.status === "FAILED" &&
    validation.validationErrors.length === 0 &&
    validation.provenanceErrors.length === 0 &&
    validation.integrityErrors.length === 0 &&
    validation.accepted.claims.length === 0 &&
    validation.accepted.entities.length === 0 &&
    validation.accepted.conflicts.length === 0 &&
    validation.accepted.missingInformation.length === 0 &&
    validation.rejected.length === 0
  );
}

export class StudyArtifactValidationPrerequisiteError extends Error {
  readonly errorCode = "STUDY_VALIDATE_PREREQUISITE_MISSING" as const;

  constructor(studyRunId: string) {
    super(`Study artifact row is required before validation (studyRunId=${studyRunId}).`);
    this.name = "StudyArtifactValidationPrerequisiteError";
  }
}

/** Worker propose step: the only code path that may INSERT a study_artifacts row. */
export function decideProposeStudyArtifactSave(
  existing: StudyArtifactSaveInput | null,
  incoming: StudyArtifactSaveInput,
): StudyArtifactSaveDecision {
  if (!existing) {
    return { action: "insert" };
  }

  const incomingProposalFp = fingerprintStudyArtifactProposal(incoming.rawProposalJson);
  const existingProposalFp = fingerprintStudyArtifactProposal(existing.rawProposalJson);
  if (incomingProposalFp !== existingProposalFp) {
    throw new StudyArtifactContentMismatchError(
      `Study artifact proposal mismatch for study run (existing=${existingProposalFp}, incoming=${incomingProposalFp}).`,
      existingProposalFp,
      incomingProposalFp,
    );
  }

  return { action: "noop" };
}

/** Worker validate step: completes validation_result_json only; never inserts. */
export function decideValidateStudyArtifactSave(
  studyRunId: string,
  existing: StudyArtifactSaveInput | null,
  incoming: StudyArtifactSaveInput,
): StudyArtifactSaveDecision {
  if (!existing) {
    throw new StudyArtifactValidationPrerequisiteError(studyRunId);
  }
  return decideStudyArtifactSave(existing, incoming);
}

export function decideStudyArtifactSave(
  existing: StudyArtifactSaveInput | null,
  incoming: StudyArtifactSaveInput,
): StudyArtifactSaveDecision {
  if (!existing) {
    return { action: "insert" };
  }

  const incomingContentFp = fingerprintStudyArtifactContent(incoming);
  const existingContentFp = fingerprintStudyArtifactContent(existing);
  if (incomingContentFp === existingContentFp) {
    return { action: "noop" };
  }

  const incomingProposalFp = fingerprintStudyArtifactProposal(incoming.rawProposalJson);
  const existingProposalFp = fingerprintStudyArtifactProposal(existing.rawProposalJson);
  if (incomingProposalFp !== existingProposalFp) {
    throw new StudyArtifactContentMismatchError(
      `Study artifact proposal mismatch for study run (existing=${existingProposalFp}, incoming=${incomingProposalFp}).`,
      existingProposalFp,
      incomingProposalFp,
    );
  }

  const incomingValidationFp = fingerprintStudyArtifactValidation(incoming.validationResultJson);
  const existingValidationFp = fingerprintStudyArtifactValidation(existing.validationResultJson);
  if (incomingValidationFp === existingValidationFp) {
    return { action: "noop" };
  }

  if (isStudyArtifactProposePlaceholder(existing.validationResultJson)) {
    return {
      action: "updateValidation",
      validationResultJson: incoming.validationResultJson,
    };
  }

  throw new StudyArtifactContentMismatchError(
    `Study artifact validation mismatch for study run (existing=${existingValidationFp}, incoming=${incomingValidationFp}).`,
    existingValidationFp,
    incomingValidationFp,
  );
}

export const STUDY_RAW_EXTRACTION_ARTIFACT_SCHEMA_VERSION = "study-raw-extraction/1" as const;

export type StudyRawExtractionOutcome = "succeeded" | "partial_failure" | "failed";

export type StudyRawExtractionArtifact = {
  schemaVersion: typeof STUDY_RAW_EXTRACTION_ARTIFACT_SCHEMA_VERSION;
  studyRunId: string;
  caseId: string;
  attemptId: string;
  outcome: StudyRawExtractionOutcome;
  succeededDocumentIds: string[];
  failedDocumentIds: string[];
  documentExtractionAttemptManifestPath?: string;
  documentExtractionStudyRunManifestPath?: string;
  audit: {
    persisted: boolean;
    status: string;
    errorCode?: string;
  };
  acceptedVerifierFactCount: number;
  observedReaderIdentity?: ObservedReaderIdentitySummary;
  readerPreflight?: ReaderPreflightSnapshot;
  createdAt: string;
};

export function isStudyRawExtractionArtifact(raw: unknown): raw is StudyRawExtractionArtifact {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  return (raw as Record<string, unknown>).schemaVersion === STUDY_RAW_EXTRACTION_ARTIFACT_SCHEMA_VERSION;
}

export function hasCompletedPackDrivenRawExtraction(rawProposalJson: unknown | null | undefined): boolean {
  return isStudyRawExtractionArtifact(rawProposalJson);
}

export function buildStudyRawExtractionValidationResult(input: {
  outcome: StudyRawExtractionOutcome;
  failedDocumentIds: readonly string[];
}): CanonicalStudyValidationResultV3 {
  const emptyAccepted = {
    entities: [],
    claims: [],
    conflicts: [],
    missingInformation: [],
  };
  if (input.outcome === "succeeded") {
    return {
      status: "SUCCEEDED",
      accepted: emptyAccepted,
      rejected: [],
      warnings: [
        {
          severity: "warning",
          code: "PACK_DRIVEN_RAW_EXTRACTION_COMPLETE",
          message: "Pack-driven raw extraction persisted for all logical documents.",
          requiresHumanAdjudication: false,
        },
      ],
      unresolved: [],
      validationErrors: [],
      provenanceErrors: [],
      integrityErrors: [],
    };
  }

  const partial = input.outcome === "partial_failure";
  return {
    status: "FAILED",
    accepted: emptyAccepted,
    rejected: [],
    warnings: [],
    unresolved: [],
    validationErrors: [
      {
        severity: "fatal",
        code: partial
          ? "PACK_DRIVEN_RAW_EXTRACTION_PARTIAL_FAILURE"
          : "PACK_DRIVEN_RAW_EXTRACTION_FAILED",
        message: partial
          ? `Raw extraction partial failure; failed document(s): ${input.failedDocumentIds.join(", ")}`
          : `Raw extraction failed for all document(s): ${input.failedDocumentIds.join(", ")}`,
      },
    ],
    provenanceErrors: [],
    integrityErrors: [],
  };
}

export function isStudyArtifactDuplicateKeyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("study_artifacts_study_run_id_key")) {
    return true;
  }
  return message.includes("23505") && message.toLowerCase().includes("study_artifacts");
}
