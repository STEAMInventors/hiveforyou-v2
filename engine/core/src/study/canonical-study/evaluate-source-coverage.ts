import type { ProposalInsightOperand } from "@hiveforyou/domain-pack";
import type {
  CanonicalStudyDocumentExtractionStatus,
  CanonicalStudyFoundationDocumentOrder,
} from "@hiveforyou/shared/canonical-study-foundation";

import type { IndexedFoundation } from "./indexed-foundation.js";

export type SourceCoverageGateMode = "extraction" | "absence";

export type SourceCoverageEvaluation = {
  complete: boolean;
  incompleteDocumentIds: string[];
  unresolvedClassificationDocumentIds: string[];
  message: string;
};

export function isExtractionReadable(
  status: CanonicalStudyDocumentExtractionStatus,
): boolean {
  return status === "SUCCEEDED";
}

export function isClassificationResolved(
  status: CanonicalStudyFoundationDocumentOrder["classificationStatus"],
): boolean {
  return status === "classified";
}

export function resolveClassificationStatus(
  documentTypeId: string | null | undefined,
): CanonicalStudyFoundationDocumentOrder["classificationStatus"] {
  if (documentTypeId == null || documentTypeId === "") {
    return "unclassified";
  }
  if (documentTypeId === "UNKNOWN") {
    return "unknown";
  }
  if (documentTypeId === "AMBIGUOUS") {
    return "ambiguous";
  }
  return "classified";
}

export function isDocumentPotentiallyInScope(
  indexed: IndexedFoundation,
  sourceDocumentId: string,
): boolean {
  const logicalDocuments = indexed.sourceContext.logicalDocuments;
  if (!logicalDocuments || logicalDocuments.length === 0) {
    return true;
  }
  return logicalDocuments.some((doc) => doc.sourceDocumentId === sourceDocumentId);
}

function isPotentiallyRelevantToDocumentType(
  document: CanonicalStudyFoundationDocumentOrder,
  typeId: string,
): boolean {
  if (document.documentTypeId === typeId) {
    return true;
  }
  if (document.documentTypeId == null || document.documentTypeId === "") {
    return true;
  }
  return (
    document.classificationStatus === "unclassified" ||
    document.classificationStatus === "unknown" ||
    document.classificationStatus === "ambiguous"
  );
}

function scopedDocuments(input: {
  indexed: IndexedFoundation;
  scopeDocumentIds: Set<string>;
  appliesTo?: string;
}): CanonicalStudyFoundationDocumentOrder[] {
  const allDocuments = input.indexed.foundation.documents;
  if (input.appliesTo?.startsWith("operative:") || input.appliesTo?.startsWith("each:")) {
    const typeId = input.appliesTo.slice(input.appliesTo.indexOf(":") + 1);
    return allDocuments.filter(
      (document) =>
        isDocumentPotentiallyInScope(input.indexed, document.sourceDocumentId) &&
        isPotentiallyRelevantToDocumentType(document, typeId),
    );
  }
  if (input.scopeDocumentIds.size > 0) {
    return allDocuments.filter((document) => input.scopeDocumentIds.has(document.sourceDocumentId));
  }
  return allDocuments.filter((document) =>
    isDocumentPotentiallyInScope(input.indexed, document.sourceDocumentId),
  );
}

function documentsForOperandScope(input: {
  indexed: IndexedFoundation;
  operand: ProposalInsightOperand;
  anchorSourceDocumentId: string | null;
}): CanonicalStudyFoundationDocumentOrder[] {
  const scope = input.operand.scope;
  if (scope?.startsWith("operative:") || scope?.startsWith("each:")) {
    const typeId = scope.slice(scope.indexOf(":") + 1);
    return input.indexed.foundation.documents.filter(
      (document) =>
        isDocumentPotentiallyInScope(input.indexed, document.sourceDocumentId) &&
        isPotentiallyRelevantToDocumentType(document, typeId),
    );
  }
  if (scope === "same_document" && input.anchorSourceDocumentId) {
    return input.indexed.foundation.documents.filter(
      (document) => document.sourceDocumentId === input.anchorSourceDocumentId,
    );
  }
  return input.indexed.foundation.documents.filter((document) =>
    isDocumentPotentiallyInScope(input.indexed, document.sourceDocumentId),
  );
}

function buildSourceCoverageMessage(input: {
  incompleteDocumentIds: string[];
  unresolvedClassificationDocumentIds: string[];
}): string {
  const messageParts: string[] = [];
  if (input.incompleteDocumentIds.length > 0) {
    messageParts.push(`source_extraction_incomplete:${input.incompleteDocumentIds.join(",")}`);
  }
  if (input.unresolvedClassificationDocumentIds.length > 0) {
    messageParts.push(
      `source_classification_unresolved:${input.unresolvedClassificationDocumentIds.join(",")}`,
    );
  }
  return messageParts.join(";");
}

function evaluateDocumentsSourceCoverage(
  documents: CanonicalStudyFoundationDocumentOrder[],
  mode: SourceCoverageGateMode,
): SourceCoverageEvaluation {
  const incompleteDocumentIds = documents
    .filter((document) => !isExtractionReadable(document.extractionStatus))
    .map((document) => document.sourceDocumentId)
    .sort((a, b) => a.localeCompare(b));

  if (incompleteDocumentIds.length > 0) {
    return {
      complete: false,
      incompleteDocumentIds,
      unresolvedClassificationDocumentIds: [],
      message: buildSourceCoverageMessage({ incompleteDocumentIds, unresolvedClassificationDocumentIds: [] }),
    };
  }

  const unresolvedClassificationDocumentIds =
    mode === "absence"
      ? documents
          .filter((document) => !isClassificationResolved(document.classificationStatus))
          .map((document) => document.sourceDocumentId)
          .sort((a, b) => a.localeCompare(b))
      : [];

  if (unresolvedClassificationDocumentIds.length > 0) {
    return {
      complete: false,
      incompleteDocumentIds: [],
      unresolvedClassificationDocumentIds,
      message: buildSourceCoverageMessage({ incompleteDocumentIds: [], unresolvedClassificationDocumentIds }),
    };
  }

  return {
    complete: true,
    incompleteDocumentIds: [],
    unresolvedClassificationDocumentIds: [],
    message: "",
  };
}

export function evaluateScopeSourceCoverage(input: {
  indexed: IndexedFoundation;
  scopeDocumentIds: Set<string>;
  appliesTo?: string;
  mode?: SourceCoverageGateMode;
}): SourceCoverageEvaluation {
  const documents = scopedDocuments(input).filter((document) =>
    isDocumentPotentiallyInScope(input.indexed, document.sourceDocumentId),
  );

  return evaluateDocumentsSourceCoverage(documents, input.mode ?? "extraction");
}

export function evaluateInsightOperandSourceCoverage(input: {
  indexed: IndexedFoundation;
  operand: ProposalInsightOperand | undefined;
  anchorSourceDocumentId: string | null;
  scopeDocumentIds?: Set<string>;
  mode?: SourceCoverageGateMode;
}): SourceCoverageEvaluation {
  const operand = input.operand;
  if (!operand) {
    return {
      complete: true,
      incompleteDocumentIds: [],
      unresolvedClassificationDocumentIds: [],
      message: "",
    };
  }

  const records = input.indexed.records.filter((record) => {
    if (operand.record && record.recordTypeId !== operand.record) {
      return false;
    }
    if (input.scopeDocumentIds && input.scopeDocumentIds.size > 0) {
      return input.scopeDocumentIds.has(record.sourceDocumentId);
    }
    const scope = operand.scope;
    if (!scope) {
      return true;
    }
    if (scope === "same_document") {
      return (
        input.anchorSourceDocumentId == null || record.sourceDocumentId === input.anchorSourceDocumentId
      );
    }
    if (scope.startsWith("operative:")) {
      const docType = scope.slice("operative:".length);
      return record.documentTypeId === docType;
    }
    return true;
  });

  const sourceDocumentIds = new Set(records.map((record) => record.sourceDocumentId));
  if (input.anchorSourceDocumentId) {
    sourceDocumentIds.add(input.anchorSourceDocumentId);
  }
  if (sourceDocumentIds.size === 0 && input.anchorSourceDocumentId) {
    sourceDocumentIds.add(input.anchorSourceDocumentId);
  }

  const operandDocuments = documentsForOperandScope({
    indexed: input.indexed,
    operand,
    anchorSourceDocumentId: input.anchorSourceDocumentId,
  });
  const documents =
    operandDocuments.length > 0
      ? operandDocuments
      : input.indexed.foundation.documents.filter(
          (document) =>
            sourceDocumentIds.has(document.sourceDocumentId) &&
            isDocumentPotentiallyInScope(input.indexed, document.sourceDocumentId),
        );

  return evaluateDocumentsSourceCoverage(documents, input.mode ?? "extraction");
}

export function mergeSourceCoverageEvaluations(
  evaluations: SourceCoverageEvaluation[],
): SourceCoverageEvaluation {
  const incompleteDocumentIds = [
    ...new Set(evaluations.flatMap((evaluation) => evaluation.incompleteDocumentIds)),
  ].sort((a, b) => a.localeCompare(b));
  const unresolvedClassificationDocumentIds = [
    ...new Set(evaluations.flatMap((evaluation) => evaluation.unresolvedClassificationDocumentIds)),
  ].sort((a, b) => a.localeCompare(b));

  if (incompleteDocumentIds.length === 0 && unresolvedClassificationDocumentIds.length === 0) {
    return {
      complete: true,
      incompleteDocumentIds: [],
      unresolvedClassificationDocumentIds: [],
      message: "",
    };
  }

  return {
    complete: false,
    incompleteDocumentIds,
    unresolvedClassificationDocumentIds,
    message: buildSourceCoverageMessage({ incompleteDocumentIds, unresolvedClassificationDocumentIds }),
  };
}
