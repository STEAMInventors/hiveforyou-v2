import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { NormalizedDocumentExtraction } from "@hiveforyou/shared/intake";

const MAX_LINES_PER_PAGE = 40;
const MAX_LINE_CHARS = 220;

export type ExtractionLocatorCatalog = {
  schemaVersion: "extraction-locator-catalog/1";
  documents: Array<{
    sourceDocumentId: string;
    logicalDocumentIds: string[];
    pages: Array<{
      physicalPageNumber: number;
      lines: Array<{ extractionId: string; text: string }>;
    }>;
  }>;
};

export function buildExtractionLocatorCatalog(input: {
  context: CanonicalStudyContext;
  extractionsBySourceId: Map<string, NormalizedDocumentExtraction>;
}): ExtractionLocatorCatalog | null {
  if (input.extractionsBySourceId.size === 0) {
    return null;
  }

  const logicalBySource = new Map<string, string[]>();
  for (const logical of input.context.logicalDocuments) {
    const list = logicalBySource.get(logical.sourceDocumentId) ?? [];
    list.push(logical.id);
    logicalBySource.set(logical.sourceDocumentId, list);
  }

  const documents: ExtractionLocatorCatalog["documents"] = [];
  for (const source of input.context.sourceDocuments) {
    const sourceDocumentId = source.sourceDocumentId ?? source.stagedDocumentId;
    if (!sourceDocumentId) {
      continue;
    }
    const normalized = input.extractionsBySourceId.get(sourceDocumentId);
    if (!normalized) {
      continue;
    }
    documents.push({
      sourceDocumentId,
      logicalDocumentIds: logicalBySource.get(sourceDocumentId) ?? [],
      pages: normalized.pages.map((page) => ({
        physicalPageNumber: page.pageNumber,
        lines: page.lines.slice(0, MAX_LINES_PER_PAGE).map((line) => ({
          extractionId: `line:${line.order}`,
          text:
            line.text.length > MAX_LINE_CHARS
              ? `${line.text.slice(0, MAX_LINE_CHARS - 1)}…`
              : line.text,
        })),
      })),
    });
  }

  if (!documents.length) {
    return null;
  }

  return {
    schemaVersion: "extraction-locator-catalog/1",
    documents,
  };
}
