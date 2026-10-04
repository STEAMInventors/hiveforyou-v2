import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type {
  ExtractionReadiness,
  ExtractionReadinessDocument,
  ExtractionReadinessUnreadableRange,
} from "@hiveforyou/shared/intake/extraction-readiness";
import type {
  NestIepRecoveredPage,
  NestIepSourceIssueCode,
  NormalizedDocumentExtraction,
  UnreadablePageRange,
} from "@hiveforyou/shared/intake";
function pageIsUnreadable(page: NestIepRecoveredPage): boolean {
  if (page.sourceIssues.some((issue) => issue.code === "CORRUPTED_PAGE")) {
    return true;
  }
  if (page.canonicalText.trim().length > 0) {
    return false;
  }
  const reasons = page.qualityDecision?.reasons ?? [];
  if (reasons.includes("empty-native-text-with-images")) {
    return true;
  }
  const images = page.qualityDecision?.metrics.imageOperatorCount;
  return typeof images === "number" && images > 0;
}

const READINESS_REASON_CODES: readonly NestIepSourceIssueCode[] = [
  "OCR_UNAVAILABLE",
  "OCR_REQUIRED",
  "OCR_FAILED",
  "CORRUPTED_PAGE",
  "UNREADABLE_DOCUMENT",
  "PARTIAL_TEXT_RECOVERY",
];

function formatPageRange(start: number, end: number): string {
  return start === end ? `${start}` : `${start}–${end}`;
}

function reasonCodesForPages(
  pages: readonly NestIepRecoveredPage[],
  range: UnreadablePageRange,
): NestIepSourceIssueCode[] {
  const codes = new Set<NestIepSourceIssueCode>();
  for (const page of pages) {
    if (page.pageNumber < range.start || page.pageNumber > range.end) {
      continue;
    }
    if (!pageIsUnreadable(page)) {
      continue;
    }
    for (const issue of page.sourceIssues) {
      if (READINESS_REASON_CODES.includes(issue.code)) {
        codes.add(issue.code);
      }
    }
    if (codes.size === 0 && pageIsUnreadable(page)) {
      codes.add("OCR_UNAVAILABLE");
    }
  }
  return [...codes].sort();
}

function intersectSourceRangeWithLogical(
  sourceRange: UnreadablePageRange,
  logicalPageStart: number,
  logicalPageEnd: number,
): { pageStart: number; pageEnd: number } | null {
  const overlapStart = Math.max(sourceRange.start, logicalPageStart);
  const overlapEnd = Math.min(sourceRange.end, logicalPageEnd);
  if (overlapStart > overlapEnd) {
    return null;
  }
  const logicalStart = overlapStart - logicalPageStart + 1;
  const logicalEnd = overlapEnd - logicalPageStart + 1;
  return { pageStart: logicalStart, pageEnd: logicalEnd };
}

function readinessRowId(sourceDocumentId: string, range: UnreadablePageRange): string {
  return `extr-readiness-${sourceDocumentId}-${range.start}-${range.end}`;
}

function humanReasonPhrase(codes: readonly NestIepSourceIssueCode[]): string {
  if (codes.includes("CORRUPTED_PAGE")) {
    return "they appear corrupted or damaged";
  }
  if (codes.some((code) => code.startsWith("OCR"))) {
    return "they appear to be scanned images";
  }
  return "Hive could not recover text from them";
}

export function buildExtractionReadiness(input: {
  context: CanonicalStudyContext;
  extractionsBySourceId: ReadonlyMap<string, NormalizedDocumentExtraction>;
}): ExtractionReadiness | null {
  const documents: ExtractionReadinessDocument[] = [];

  for (const source of input.context.sourceDocuments) {
    const sourceDocumentId = source.sourceDocumentId;
    if (!sourceDocumentId) {
      continue;
    }
    const extraction = input.extractionsBySourceId.get(sourceDocumentId);
    const ranges = extraction?.unreadablePageRanges ?? [];
    if (ranges.length === 0) {
      continue;
    }
    const pageCount = extraction?.statistics.pageCount ?? ranges[ranges.length - 1]!.end;
    const unreadableCount = ranges.reduce((sum, range) => sum + (range.end - range.start + 1), 0);
    const status = unreadableCount >= pageCount ? "NEEDS_OCR" : "PARTIAL";
    const pages = extraction?.pages ?? [];

    const unreadableRanges: ExtractionReadinessUnreadableRange[] = ranges.map((range) => {
      const logicalDocuments = input.context.logicalDocuments
        .filter((doc) => doc.sourceDocumentId === sourceDocumentId)
        .map((doc) => {
          const pageEnd = doc.pageEnd ?? doc.pageStart;
          const mapped = intersectSourceRangeWithLogical(range, doc.pageStart, pageEnd);
          if (!mapped) {
            return null;
          }
          return {
            logicalDocumentId: doc.id,
            pageStart: mapped.pageStart,
            pageEnd: mapped.pageEnd,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null);

      return {
        id: readinessRowId(sourceDocumentId, range),
        sourcePageStart: range.start,
        sourcePageEnd: range.end,
        reasonCodes: reasonCodesForPages(pages, range),
        logicalDocuments,
      };
    });

    documents.push({
      sourceDocumentId,
      filename: source.originalFilename,
      status,
      unreadableRanges,
    });
  }

  if (documents.length === 0) {
    return null;
  }

  return {
    schemaVersion: "extraction-readiness/1",
    documents,
  };
}

export function parentDescriptionForReadinessDocument(
  doc: ExtractionReadinessDocument,
  logicalTitles?: ReadonlyMap<string, string>,
): string {
  const filename = doc.filename;
  if (doc.status === "NEEDS_OCR") {
    const reasons = doc.unreadableRanges.flatMap((range) => range.reasonCodes);
    const phrase = humanReasonPhrase(reasons);
    return `${filename} couldn't be read at all (${phrase}). Uploading a clearer copy or a text PDF would let Hive check it.`;
  }
  const range = doc.unreadableRanges[0];
  if (!range) {
    return `${filename} has pages Hive couldn't read. Uploading a clearer copy or a text PDF would help.`;
  }
  const sourcePages = formatPageRange(range.sourcePageStart, range.sourcePageEnd);
  const phrase = humanReasonPhrase(range.reasonCodes);
  const logicalHint =
    range.logicalDocuments.length === 1
      ? (() => {
          const logical = range.logicalDocuments[0]!;
          const label =
            logicalTitles?.get(logical.logicalDocumentId) ?? logical.logicalDocumentId;
          const logicalPages = formatPageRange(logical.pageStart, logical.pageEnd);
          return ` (pages ${sourcePages} of the upload = pages ${logicalPages} of the ${label})`;
        })()
      : "";
  return `Pages ${sourcePages} of ${filename} couldn't be read (${phrase})${logicalHint}. Uploading a clearer copy or a text PDF would let Hive check them.`;
}

export function proDescriptionForReadinessRange(
  doc: ExtractionReadinessDocument,
  range: ExtractionReadinessUnreadableRange,
): string {
  const sourcePages = formatPageRange(range.sourcePageStart, range.sourcePageEnd);
  const logicalParts = range.logicalDocuments.map(
    (logical) =>
      `${logical.logicalDocumentId} pages ${formatPageRange(logical.pageStart, logical.pageEnd)}`,
  );
  const logicalText =
    logicalParts.length > 0
      ? ` Upload pages ${sourcePages} = ${logicalParts.join("; ")}.`
      : "";
  return `Source ${doc.sourceDocumentId} (${doc.filename}) unreadable pages ${sourcePages}. Reason codes: ${range.reasonCodes.join(", ")}.${logicalText}`;
}

export function serializeExtractionReadinessForPrompt(
  readiness: ExtractionReadiness,
): string {
  return JSON.stringify(readiness, null, 2);
}
