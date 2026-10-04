import {
  documentIdentityLabel,
  type DocumentIdentityType,
  type IntakeDocumentStatus,
  type IntakeRunStatus,
} from "./document-identity";

/** Browser payload. Confidence and classifier internals are omitted. */
export type IntakeCustomerDocument = {
  sourceDocumentId: string;
  processingStatus: IntakeDocumentStatus;
  label: string | null;
  filename: string;
  sizeBytes: number;
};

export type IntakeCustomerView = {
  intakeRunId: string;
  status: IntakeRunStatus;
  /** True when the run is terminal and persisted normalized extractions satisfy the workspace gate. */
  workspaceReady: boolean;
  documents: IntakeCustomerDocument[];
};

export type IntakeCustomerViewDocumentInput = {
  sourceDocumentId: string;
  processingStatus: IntakeDocumentStatus;
  proposedType: DocumentIdentityType | null;
  errorCode?: string | null;
  filename: string;
  sizeBytes: number;
  hasNormalizedExtraction: boolean;
};

function documentRequiresNormalizedArtifact(
  status: IntakeDocumentStatus,
  errorCode: string | null,
): boolean {
  if (status === "UPLOADED" || status === "EXTRACTING" || status === "CLASSIFYING") {
    return false;
  }
  if (status === "FAILED" && errorCode === "SOURCE_MISSING") {
    return false;
  }
  if (
    status === "FAILED" &&
    (errorCode === "ENCRYPTED_PDF" || errorCode === "EXTRACTION_FAILED")
  ) {
    return false;
  }
  return true;
}

export function computeIntakeWorkspaceReady(
  runStatus: IntakeRunStatus,
  documents: Array<{
    processingStatus: IntakeDocumentStatus;
    errorCode?: string | null;
    hasNormalizedExtraction: boolean;
  }>,
): boolean {
  if (runStatus === "RUNNING") {
    return false;
  }
  return documents.every((document) => {
    if (
      !documentRequiresNormalizedArtifact(
        document.processingStatus,
        document.errorCode ?? null,
      )
    ) {
      return true;
    }
    return document.hasNormalizedExtraction;
  });
}

export function toIntakeCustomerView(
  run: { id: string; status: IntakeRunStatus },
  documents: IntakeCustomerViewDocumentInput[],
): IntakeCustomerView {
  return {
    intakeRunId: run.id,
    status: run.status,
    workspaceReady: computeIntakeWorkspaceReady(run.status, documents),
    documents: documents.map((document) => ({
      sourceDocumentId: document.sourceDocumentId,
      processingStatus: document.processingStatus,
      label:
        document.processingStatus === "CLASSIFIED" && document.proposedType
          ? documentIdentityLabel(document.proposedType)
          : null,
      filename: document.filename,
      sizeBytes: document.sizeBytes,
    })),
  };
}
