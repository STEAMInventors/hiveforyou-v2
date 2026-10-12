import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";

import type { StudyArtifactRecord } from "@hiveforyou/core";

export function applyPackDrivenReaderClassificationNeedsReview(
  validation: CanonicalStudyValidationResultV3,
  affectedDocumentIds: readonly string[],
): CanonicalStudyValidationResultV3 {
  if (affectedDocumentIds.length === 0 || validation.status === "FAILED") {
    return validation;
  }
  return {
    ...validation,
    status: "NEEDS_REVIEW",
    warnings: [
      ...validation.warnings,
      {
        severity: "warning",
        code: "PACK_DRIVEN_READER_CLASSIFICATION_NEEDS_REVIEW",
        message: `Pack-driven Reader classification requires review for document(s): ${affectedDocumentIds.join(", ")}`,
        requiresHumanAdjudication: true,
        relatedIds: [...affectedDocumentIds],
      },
    ],
  };
}

export function patchStudyArtifactForReaderNeedsReview(
  artifact: StudyArtifactRecord,
  affectedDocumentIds: readonly string[],
): Omit<StudyArtifactRecord, "createdAt"> | null {
  if (!artifact.validationResultJson || affectedDocumentIds.length === 0) {
    return null;
  }
  const validation = artifact.validationResultJson as CanonicalStudyValidationResultV3;
  return {
    studyRunId: artifact.studyRunId,
    caseId: artifact.caseId,
    userId: artifact.userId,
    rawProposalJson: artifact.rawProposalJson,
    validationResultJson: applyPackDrivenReaderClassificationNeedsReview(
      validation,
      affectedDocumentIds,
    ),
  };
}
