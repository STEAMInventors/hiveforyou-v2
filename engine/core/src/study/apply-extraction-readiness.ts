import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { ProposedMissingInformation } from "@hiveforyou/shared/case-intelligence/3";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";
import type { ExtractionReadiness } from "@hiveforyou/shared/intake/extraction-readiness";

import {
  parentDescriptionForReadinessDocument,
  proDescriptionForReadinessRange,
} from "./build-extraction-readiness";

const UNREADABLE_CAVEAT_PREFIX = "[Unreadable pages caveat]";

export function extractionMissingInformationRows(
  readiness: ExtractionReadiness,
  context: CanonicalStudyContext,
): ProposedMissingInformation[] {
  const logicalTitles = new Map(
    context.logicalDocuments.map((doc) => [doc.id, doc.title]),
  );
  const rows: ProposedMissingInformation[] = [];
  for (const doc of readiness.documents) {
    if (doc.status === "NEEDS_OCR") {
      const range = doc.unreadableRanges[0];
      rows.push({
        id: range?.id ?? `extr-readiness-${doc.sourceDocumentId}-all`,
        description: parentDescriptionForReadinessDocument(doc, logicalTitles),
        proposalLineage: {
          proposalItemId: range?.id ?? `extr-readiness-${doc.sourceDocumentId}-all`,
          studyRunId: context.studyRunId,
        },
      });
      continue;
    }
    for (const range of doc.unreadableRanges) {
      rows.push({
        id: range.id,
        description: parentDescriptionForReadinessDocument(
          {
            ...doc,
            unreadableRanges: [range],
          },
          logicalTitles,
        ),
        proposalLineage: {
          proposalItemId: range.id,
          studyRunId: context.studyRunId,
        },
      });
    }
  }
  return rows;
}

export function mergeExtractionReadinessIntoValidation(
  validation: CanonicalStudyValidationResultV3,
  readiness: ExtractionReadiness,
  context: CanonicalStudyContext,
): CanonicalStudyValidationResultV3 {
  const extractionRows = extractionMissingInformationRows(readiness, context);
  const existingIds = new Set(validation.accepted.missingInformation.map((row) => row.id));
  const merged = [
    ...validation.accepted.missingInformation,
    ...extractionRows.filter((row) => !existingIds.has(row.id)),
  ];
  return {
    ...validation,
    accepted: {
      ...validation.accepted,
      missingInformation: merged,
    },
  };
}

function sourceIdsWithUnreadablePages(readiness: ExtractionReadiness): Set<string> {
  return new Set(readiness.documents.map((doc) => doc.sourceDocumentId));
}

function logicalIdsWithUnreadablePages(
  readiness: ExtractionReadiness,
  context: CanonicalStudyContext,
): Set<string> {
  const ids = new Set<string>();
  for (const doc of readiness.documents) {
    for (const range of doc.unreadableRanges) {
      for (const logical of range.logicalDocuments) {
        ids.add(logical.logicalDocumentId);
      }
    }
  }
  for (const logical of context.logicalDocuments) {
    if (sourceIdsWithUnreadablePages(readiness).has(logical.sourceDocumentId)) {
      ids.add(logical.id);
    }
  }
  return ids;
}

const NOT_FOUND_PATTERN =
  /\b(not found|could not find|does not show|do not show|not in the|absent from|no evidence of|not present in|missing from)\b/i;

function missingInfoTargetsUnreadableDoc(
  gap: ProposedMissingInformation,
  readiness: ExtractionReadiness,
  context: CanonicalStudyContext,
): boolean {
  if (!NOT_FOUND_PATTERN.test(gap.description)) {
    return false;
  }
  const unreadableSources = sourceIdsWithUnreadablePages(readiness);
  const unreadableLogical = logicalIdsWithUnreadablePages(readiness, context);
  for (const ref of gap.evidenceRefs ?? []) {
    if (ref.sourceDocumentId && unreadableSources.has(ref.sourceDocumentId)) {
      return true;
    }
    if (ref.logicalDocumentId && unreadableLogical.has(ref.logicalDocumentId)) {
      return true;
    }
  }
  const haystack = gap.description.toLowerCase();
  for (const doc of readiness.documents) {
    if (haystack.includes(doc.filename.toLowerCase())) {
      return true;
    }
  }
  for (const logical of context.logicalDocuments) {
    if (unreadableLogical.has(logical.id) && haystack.includes(logical.title.toLowerCase())) {
      return true;
    }
  }
  return unreadableSources.size > 0;
}

function caveatForGap(
  gap: ProposedMissingInformation,
  readiness: ExtractionReadiness,
): string {
  const refs = readiness.documents.flatMap((doc) => doc.unreadableRanges.map((range) => range.id));
  const proDetails = readiness.documents.flatMap((doc) =>
    doc.unreadableRanges.map((range) => proDescriptionForReadinessRange(doc, range)),
  );
  return `${UNREADABLE_CAVEAT_PREFIX} Document has unreadable page ranges (${refs.join(", ")}). Do not treat this as confirmed absence; content may be on unreadable pages. Pro detail: ${proDetails.join(" | ")}`;
}

export function attachUnreadablePageCaveats(
  validation: CanonicalStudyValidationResultV3,
  readiness: ExtractionReadiness,
  context: CanonicalStudyContext,
): CanonicalStudyValidationResultV3 {
  const missingInformation = validation.accepted.missingInformation.map((gap) => {
    if (gap.description.includes(UNREADABLE_CAVEAT_PREFIX)) {
      return gap;
    }
    if (!missingInfoTargetsUnreadableDoc(gap, readiness, context)) {
      return gap;
    }
    return {
      ...gap,
      description: `${gap.description.trim()} ${caveatForGap(gap, readiness)}`,
    };
  });
  return {
    ...validation,
    accepted: {
      ...validation.accepted,
      missingInformation,
    },
  };
}

export function enrichValidationWithExtractionReadiness(
  validation: CanonicalStudyValidationResultV3,
  readiness: ExtractionReadiness | null,
  context: CanonicalStudyContext,
): CanonicalStudyValidationResultV3 {
  if (!readiness) {
    return validation;
  }
  let next = mergeExtractionReadinessIntoValidation(validation, readiness, context);
  next = attachUnreadablePageCaveats(next, readiness, context);
  return next;
}
