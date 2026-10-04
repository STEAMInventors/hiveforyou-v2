import type { EvidenceReference } from "@hiveforyou/shared/case-intelligence/3";
import type { StudySourceDocumentRef } from "@hiveforyou/shared/canonical-study";
import type { StructureMap, StructureMapLogicalDocument } from "@hiveforyou/shared/discover";
import type {
  NestIepRecoveredPage,
  NormalizedDocumentExtraction,
} from "@hiveforyou/shared/intake";
import type {
  EvidenceProvenanceResolution,
  ResolvedEvidenceRef,
  ResolvedEvidenceRegion,
} from "@hiveforyou/shared/projections";

import {
  logicalPageNumberFromPhysical,
  physicalPageFromEvidenceRef,
} from "./logical-to-physical-page";
import { locateSnippetInPage } from "./locate-snippet-in-page";
import { parseExtractionUnitId } from "./parse-extraction-unit-id";

export type EvidenceResolutionContext = {
  structureMap: StructureMap | null;
  sourceDocuments: StudySourceDocumentRef[];
  normalizedExtraction?: NormalizedDocumentExtraction | null;
  /** Source documents removed from analysis (Intake DISCARDED). */
  discardedSourceDocumentIds?: ReadonlySet<string>;
  claimId?: string;
};

function regionFromBBox(
  box: { x: number; y: number; width: number; height: number } | undefined,
): ResolvedEvidenceRegion | undefined {
  if (!box) {
    return undefined;
  }
  if (
    !Number.isFinite(box.x) ||
    !Number.isFinite(box.y) ||
    !Number.isFinite(box.width) ||
    !Number.isFinite(box.height) ||
    box.width <= 0 ||
    box.height <= 0
  ) {
    return undefined;
  }
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    coordinateSpace: "source-document-page",
  };
}

function resolveSourceMeta(
  ref: EvidenceReference,
  logical: StructureMapLogicalDocument | undefined,
  sourceDocuments: StudySourceDocumentRef[],
): Pick<
  ResolvedEvidenceRef,
  "sourceFilename" | "sha256" | "logicalTitle" | "logicalDocumentType" | "logicalDomainId"
> {
  const sourceId = logical?.sourceDocumentId ?? ref.sourceDocumentId;
  const source = sourceDocuments.find(
    (doc) =>
      doc.sourceDocumentId === sourceId ||
      doc.stagedDocumentId === sourceId ||
      doc.discoveryDocumentId === sourceId,
  );
  return {
    logicalTitle: logical?.title,
    logicalDocumentType: logical?.documentType,
    logicalDomainId: logical?.domainId,
    sourceFilename: source?.originalFilename,
    sha256: source?.sha256,
  };
}

function pageForRef(
  ref: EvidenceReference,
  logical: StructureMapLogicalDocument | undefined,
  normalized: NormalizedDocumentExtraction | null | undefined,
): { physical: number | null; issues: string[] } {
  const issues: string[] = [];
  const physical = physicalPageFromEvidenceRef(ref.page);
  if (physical === null) {
    return { physical: null, issues };
  }
  if (logical) {
    const end = logical.pageEnd ?? logical.pageStart;
    if (physical < logical.pageStart || physical > end) {
      issues.push("EVIDENCE_PAGE_OUT_OF_RANGE");
    }
  }
  if (normalized) {
    const hasPage = normalized.pages.some((page) => page.pageNumber === physical);
    if (!hasPage) {
      issues.push("NORMALIZED_PAGE_MISSING");
    }
  }
  return { physical, issues };
}

function snippetFromSpan(
  page: NestIepRecoveredPage,
  spanStart: number,
  spanEnd: number,
): { snippet?: string; span?: { start: number; end: number }; issues: string[] } {
  const issues: string[] = [];
  const text = page.canonicalText;
  if (spanStart < 0 || spanEnd > text.length || spanStart >= spanEnd) {
    issues.push("SPAN_OUT_OF_RANGE");
    return { issues };
  }
  return {
    snippet: text.slice(spanStart, spanEnd),
    span: { start: spanStart, end: spanEnd },
    issues,
  };
}

function resolveFromExtractionUnit(
  page: NestIepRecoveredPage,
  extractionId: string,
): {
  snippet?: string;
  span?: { start: number; end: number };
  region?: ResolvedEvidenceRegion;
  lineOrder?: number;
  blockIndex?: number;
  issues: string[];
} {
  const parsed = parseExtractionUnitId(extractionId);
  if (!parsed) {
    return { issues: ["MALFORMED_EXTRACTION_ID"] };
  }
  if (parsed.kind === "line") {
    const line = page.lines.find((row) => row.order === parsed.order);
    if (!line) {
      return { issues: ["EXTRACTION_LINE_NOT_FOUND"] };
    }
    return {
      snippet: line.text,
      span: { start: line.startOffset, end: line.endOffset },
      region: regionFromBBox(line.boundingBox),
      lineOrder: line.order,
      issues: [],
    };
  }
  const block = page.blocks[parsed.index];
  if (!block) {
    return { issues: ["EXTRACTION_BLOCK_NOT_FOUND"] };
  }
  const snippet = page.canonicalText.slice(block.startOffset, block.endOffset);
  return {
    snippet,
    span: { start: block.startOffset, end: block.endOffset },
    region: regionFromBBox(block.boundingBox),
    blockIndex: parsed.index,
    issues: [],
  };
}

/**
 * Deterministic evidence trace resolver. Uses persisted normalized extraction only.
 * Priority: extractionId → page+span → page+line/block via extractionId → bbox from unit → page/snippet partial.
 */
export function resolveEvidenceReference(
  ref: EvidenceReference,
  context: EvidenceResolutionContext,
): ResolvedEvidenceRef {
  const issues: string[] = [];
  const logical = ref.logicalDocumentId
    ? context.structureMap?.logicalDocuments.find((doc) => doc.id === ref.logicalDocumentId)
    : undefined;

  if (ref.logicalDocumentId && !logical) {
    issues.push("LOGICAL_DOCUMENT_MISSING");
  }

  const sourceDocumentId = logical?.sourceDocumentId ?? ref.sourceDocumentId;
  if (context.discardedSourceDocumentIds?.has(sourceDocumentId)) {
    issues.push("SOURCE_DISCARDED");
  }

  const sourceKnown = context.sourceDocuments.some(
    (doc) =>
      doc.sourceDocumentId === sourceDocumentId ||
      doc.stagedDocumentId === sourceDocumentId ||
      doc.discoveryDocumentId === sourceDocumentId,
  );
  if (!sourceKnown) {
    issues.push("SOURCE_DOCUMENT_MISSING");
  }

  const meta = resolveSourceMeta(ref, logical, context.sourceDocuments);
  const normalized = context.normalizedExtraction ?? null;
  if (!normalized && (ref.extractionId || ref.page !== undefined || ref.spanStart !== undefined)) {
    issues.push("NORMALIZED_EXTRACTION_MISSING");
  }

  const { physical, issues: pageIssues } = pageForRef(ref, logical, normalized);
  issues.push(...pageIssues);

  const logicalPage =
    logical && physical !== null
      ? logicalPageNumberFromPhysical(logical, physical)
      : null;
  if (logical && physical !== null && logicalPage === null) {
    issues.push("LOGICAL_PAGE_UNMAPPABLE");
  }

  let snippet = ref.snippet?.trim() || undefined;
  let span: { start: number; end: number } | undefined;
  let region: ResolvedEvidenceRegion | undefined;
  let lineOrder: number | undefined;
  let blockIndex: number | undefined;
  let extractionMethod: string | undefined;

  const pageRecord =
    physical !== null && normalized
      ? normalized.pages.find((page) => page.pageNumber === physical)
      : undefined;

  if (pageRecord) {
    extractionMethod = pageRecord.extractionMethod;
  }

  let locatorExact = false;

  if (pageRecord && ref.extractionId) {
    const unit = resolveFromExtractionUnit(pageRecord, ref.extractionId);
    issues.push(...unit.issues);
    if (unit.snippet) {
      snippet = unit.snippet;
      span = { start: 0, end: unit.snippet.length };
      region = unit.region;
      lineOrder = unit.lineOrder;
      blockIndex = unit.blockIndex;
      locatorExact = true;
    }
  }

  if (
    pageRecord &&
    !locatorExact &&
    ref.spanStart !== undefined &&
    ref.spanEnd !== undefined
  ) {
    const spanResult = snippetFromSpan(pageRecord, ref.spanStart, ref.spanEnd);
    issues.push(...spanResult.issues);
    if (spanResult.snippet) {
      snippet = spanResult.snippet;
      span = { start: 0, end: spanResult.snippet.length };
      locatorExact = true;
    }
  }

  if (pageRecord && !locatorExact && snippet) {
    const located = locateSnippetInPage(pageRecord, snippet);
    if (located.ok) {
      snippet = located.matchedText;
      span = { start: 0, end: located.matchedText.length };
      region = located.region ?? region;
      lineOrder = located.lineOrder ?? lineOrder;
      locatorExact = true;
      issues.push("SNIPPET_BACKFILLED");
    } else if (located.issue === "SNIPPET_AMBIGUOUS") {
      issues.push("SNIPPET_AMBIGUOUS");
    } else {
      issues.push("SNIPPET_NOT_FOUND");
    }
  }

  const blocking = new Set([
    "LOGICAL_DOCUMENT_MISSING",
    "SOURCE_DOCUMENT_MISSING",
    "SOURCE_DISCARDED",
    "NORMALIZED_EXTRACTION_MISSING",
    "EVIDENCE_PAGE_OUT_OF_RANGE",
    "NORMALIZED_PAGE_MISSING",
    "SPAN_OUT_OF_RANGE",
    "MALFORMED_EXTRACTION_ID",
    "EXTRACTION_LINE_NOT_FOUND",
    "EXTRACTION_BLOCK_NOT_FOUND",
  ]);

  let resolution: EvidenceProvenanceResolution = "UNRESOLVED";
  if (issues.some((code) => blocking.has(code))) {
    resolution = "UNRESOLVED";
  } else if (locatorExact) {
    resolution = "EXACT";
  } else if (physical !== null || snippet) {
    resolution = "PARTIAL";
  }

  return {
    ...ref,
    ...meta,
    evidenceRefId: ref.id,
    claimId: context.claimId,
    sourceDocumentId,
    logicalDocumentId: ref.logicalDocumentId ?? logical?.id,
    physicalPageNumber: physical ?? undefined,
    logicalPageNumber: logicalPage ?? undefined,
    page: physical ?? ref.page,
    canonicalTextSnippet: snippet,
    span,
    region,
    lineOrder,
    blockIndex,
    extractionMethod,
    resolution,
    resolutionIssues: issues.length ? [...issues] : undefined,
  };
}
