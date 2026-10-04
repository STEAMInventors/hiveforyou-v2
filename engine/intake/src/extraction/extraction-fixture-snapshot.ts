import type { DocumentExtractionResult } from "../types";

export type ExtractionFixtureGolden = {
  readonly caseId: string;
  readonly comment?: string;
  readonly fixtureFile: string;
  readonly mimeType: string | null;
  readonly extractionStatus: string;
  readonly errorCode: string | null;
  readonly extractorVersion: string | null;
  readonly unreadablePageRanges: ReadonlyArray<{ start: number; end: number }>;
  readonly pages: ReadonlyArray<{
    pageNumber: number;
    extractionMethod: string;
    issueCodes: readonly string[];
    canonicalText: string;
  }>;
  readonly canonicalText: string;
};

export function snapshotFromExtraction(
  meta: Pick<ExtractionFixtureGolden, "caseId" | "comment" | "fixtureFile" | "mimeType">,
  result: DocumentExtractionResult,
): ExtractionFixtureGolden {
  const normalized = result.normalizedExtraction;
  return {
    ...meta,
    extractionStatus: result.extractionStatus,
    errorCode: result.errorCode,
    extractorVersion: normalized?.extractorVersion ?? null,
    unreadablePageRanges: normalized?.unreadablePageRanges ?? [],
    pages: (normalized?.pages ?? []).map((page) => ({
      pageNumber: page.pageNumber,
      extractionMethod: page.extractionMethod,
      issueCodes: page.sourceIssues.map((issue) => issue.code).sort(),
      canonicalText: page.canonicalText,
    })),
    canonicalText: result.text,
  };
}
