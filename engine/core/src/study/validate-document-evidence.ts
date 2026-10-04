import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { ValidationIssue } from "@hiveforyou/shared/canonical-study";

export type DocumentEvidenceRef = {
  id: string;
  sourceDocumentId: string;
  logicalDocumentId?: string;
  page?: number;
  pageEnd?: number;
  spanStart?: number;
  spanEnd?: number;
  snippet?: string;
  extractionId?: string;
  sourceType: "document" | string;
};

function issue(
  partial: Omit<ValidationIssue, "severity"> & { severity?: ValidationIssue["severity"] },
): ValidationIssue {
  return {
    severity: partial.severity ?? "reject",
    ...partial,
  };
}

export function documentIdsInContext(context: CanonicalStudyContext): Set<string> {
  const ids = new Set<string>();
  for (const doc of context.sourceDocuments) {
    ids.add(doc.stagedDocumentId);
    if (doc.sourceDocumentId) {
      ids.add(doc.sourceDocumentId);
    }
    if (doc.discoveryDocumentId) {
      ids.add(doc.discoveryDocumentId);
    }
  }
  for (const doc of context.engine1Result.documents) {
    ids.add(doc.id);
    if (doc.stagedDocumentId) {
      ids.add(doc.stagedDocumentId);
    }
  }
  return ids;
}

function logicalDocumentIndex(
  context: CanonicalStudyContext,
): Map<string, CanonicalStudyContext["logicalDocuments"][number]> {
  return new Map(context.logicalDocuments.map((doc) => [doc.id, doc]));
}

function resolveSourceDocumentId(refId: string, known: Set<string>): boolean {
  return known.has(refId);
}

function hasEvidenceLocator(ref: DocumentEvidenceRef): boolean {
  return (
    ref.page !== undefined ||
    ref.spanStart !== undefined ||
    ref.spanEnd !== undefined ||
    (ref.snippet !== undefined && ref.snippet.trim().length > 0)
  );
}

export function validateDocumentEvidenceRefs(
  context: CanonicalStudyContext,
  ownerId: string,
  evidenceRefs: DocumentEvidenceRef[],
  knownDocs: Set<string>,
  pathPrefix: string,
  options: { requireAtLeastOne: boolean; requireLocator?: boolean },
): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  if (options.requireAtLeastOne && !evidenceRefs.length) {
    errors.push(
      issue({
        code: "PROVENANCE_MISSING",
        message: "Factual item has no evidence reference.",
        severity: "reject",
        path: pathPrefix,
        relatedIds: [ownerId],
      }),
    );
    return errors;
  }

  const logicalById = logicalDocumentIndex(context);
  const strictLogical = context.logicalDocuments.length > 0;

  for (const ref of evidenceRefs) {
    if (ref.sourceType !== "document") {
      errors.push(
        issue({
          code: "INVALID_EVIDENCE_SOURCE_TYPE",
          message:
            "Documentary factual findings must use document evidence only. Customer Q&A is never evidence.",
          severity: "reject",
          path: pathPrefix,
          relatedIds: [ownerId, ref.id],
        }),
      );
      continue;
    }

    if (options.requireLocator && !hasEvidenceLocator(ref)) {
      errors.push(
        issue({
          code: "EVIDENCE_LOCATOR_MISSING",
          message: "Evidence reference must include page, span, or snippet locator.",
          severity: "reject",
          path: pathPrefix,
          relatedIds: [ownerId, ref.id],
        }),
      );
    }

    if (strictLogical && !ref.logicalDocumentId) {
      errors.push(
        issue({
          code: "LOGICAL_DOCUMENT_REQUIRED",
          message: "Document-backed factual evidence must reference a logical document.",
          severity: "reject",
          path: pathPrefix,
          relatedIds: [ownerId],
        }),
      );
      continue;
    }

    if (ref.logicalDocumentId) {
      const logical = logicalById.get(ref.logicalDocumentId);
      if (!logical) {
        errors.push(
          issue({
            code: "UNKNOWN_LOGICAL_DOCUMENT",
            message: "Evidence references unknown logical document.",
            severity: "reject",
            path: pathPrefix,
            relatedIds: [ownerId, ref.logicalDocumentId],
          }),
        );
        continue;
      }
      if (
        ref.sourceDocumentId !== logical.sourceDocumentId &&
        !resolveSourceDocumentId(ref.sourceDocumentId, knownDocs)
      ) {
        errors.push(
          issue({
            code: "LOGICAL_SOURCE_MISMATCH",
            message: "Evidence source document does not match logical document.",
            severity: "reject",
            path: pathPrefix,
            relatedIds: [ownerId, ref.logicalDocumentId, ref.sourceDocumentId],
          }),
        );
      }
      if (ref.page !== undefined) {
        const pageEnd = ref.pageEnd ?? ref.page;
        if (ref.page < logical.pageStart || pageEnd > (logical.pageEnd ?? logical.pageStart)) {
          errors.push(
            issue({
              code: "EVIDENCE_PAGE_OUT_OF_RANGE",
              message: "Evidence page is outside logical document bounds.",
              severity: "reject",
              path: pathPrefix,
              relatedIds: [ownerId, ref.logicalDocumentId],
            }),
          );
        }
      }
    }

    if (!resolveSourceDocumentId(ref.sourceDocumentId, knownDocs)) {
      errors.push(
        issue({
          code: "UNKNOWN_SOURCE_DOCUMENT",
          message: "Evidence references unknown source document.",
          severity: "reject",
          path: pathPrefix,
          relatedIds: [ownerId, ref.sourceDocumentId],
        }),
      );
    }
  }
  return errors;
}
