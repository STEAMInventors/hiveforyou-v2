import {
  validateLogicalPageBoundaries,
  type LogicalPageBoundary,
  type PacketSegmentationResolver,
} from "@hiveforyou/domain-pack";

import type { IepDocumentFamily, IepScanDocument } from "./contracts";

/** Ported from NestIEP `lib/scan/types.ts` — boundary metadata for one logical document span. */
export type IepLogicalDocumentBoundary = LogicalPageBoundary & {
  family?: IepDocumentFamily;
  subtype?: string;
  documentDate?: string | null;
  signals?: string[];
};

export type IepSegmentationDiagnostics = {
  uploadCount: number;
  logicalDocumentCount: number;
  packetCount: number;
  identityCount: number;
  validationErrors: string[];
  /** Upload ids where segmentation was required but boundaries were not applied. */
  unresolvedPacketUploadIds: string[];
};

const PACKET_PAGE_THRESHOLD = 8;

const FAMILY_SIGNALS: Array<{ family: IepDocumentFamily; pattern: RegExp }> = [
  { family: "REFERRAL", pattern: /\breferral\b|\bchild find\b|\brequest for evaluation\b/i },
  { family: "EVAL_PLAN", pattern: /\bevaluation plan\b|\bassessment plan\b|\bconsent to evaluate\b/i },
  { family: "EVALUATION", pattern: /\bpsychoeducational\b|\bevaluation report\b|\bassessment results\b/i },
  { family: "IEP", pattern: /\bindividualized education\b|\biep team\b|\bpresent levels\b|\bannual goals\b/i },
  { family: "ELIGIBILITY", pattern: /\beligibility determination\b|\bqualifies as\b/i },
  { family: "PROGRESS", pattern: /\bprogress report\b|\bmarking period\b/i },
];

export function identityBoundaries(document: IepScanDocument): IepLogicalDocumentBoundary[] {
  const pageCount = Math.max(document.pageCount, document.pages.length, 1);
  const pages = document.pages.map((page) => page.pageNumber).sort((a, b) => a - b);
  const startPage = pages[0] ?? 1;
  const endPage = pages.at(-1) ?? pageCount;
  const uploadId = document.sourceUploadId ?? document.scanDocumentId;
  return [
    {
      logicalDocumentId: document.scanDocumentId,
      sourceUploadId: uploadId,
      startPage,
      endPage,
      confidence: 1,
      signals: ["identity"],
    },
  ];
}

export function detectPacketFamilySignals(
  pages: Array<{ pageNumber: number; text: string }>,
): IepDocumentFamily[] {
  const hits = new Set<IepDocumentFamily>();
  for (const page of pages) {
    for (const signal of FAMILY_SIGNALS) {
      if (signal.pattern.test(page.text)) {
        hits.add(signal.family);
      }
    }
  }
  return [...hits];
}

export function packetSegmentationNeeded(document: IepScanDocument): boolean {
  if (document.duplicateOfDocumentId) {
    return false;
  }
  if (document.readStatus !== "ok") {
    return false;
  }
  const families = detectPacketFamilySignals(document.pages);
  return document.pageCount >= PACKET_PAGE_THRESHOLD && families.length >= 2;
}

export function validateLogicalBoundaries(
  boundaries: IepLogicalDocumentBoundary[],
  pageCount: number,
) {
  return validateLogicalPageBoundaries(boundaries, pageCount);
}

export function applyLogicalSegmentation(
  document: IepScanDocument,
  boundaries: IepLogicalDocumentBoundary[],
): IepScanDocument[] {
  const pageCount = Math.max(document.pageCount, document.pages.length, 1);
  const validated = validateLogicalBoundaries(boundaries, pageCount);
  const ranges = validated.ok ? validated.boundaries : identityBoundaries(document);
  const soleRange = ranges[0];
  if (
    ranges.length === 1 &&
    soleRange !== undefined &&
    soleRange.startPage === 1 &&
    soleRange.endPage === pageCount
  ) {
    return [
      {
        ...document,
        sourceUploadId: document.sourceUploadId ?? document.scanDocumentId,
        logicalStartPage: soleRange.startPage,
        logicalEndPage: soleRange.endPage,
      },
    ];
  }
  return ranges.map((range, index) => {
    const pages = document.pages.filter(
      (page) => page.pageNumber >= range.startPage && page.pageNumber <= range.endPage,
    );
    const logicalId =
      range.logicalDocumentId && range.logicalDocumentId !== document.scanDocumentId
        ? range.logicalDocumentId
        : `${document.scanDocumentId}:p${range.startPage}-${range.endPage}`;
    return {
      ...document,
      scanDocumentId: index === 0 && ranges.length === 1 ? document.scanDocumentId : logicalId,
      pageCount: pages.length,
      pages,
      sourceUploadId: document.sourceUploadId ?? document.scanDocumentId,
      logicalStartPage: range.startPage,
      logicalEndPage: range.endPage,
    };
  });
}

export async function segmentIepScanDocuments(
  documents: IepScanDocument[],
  resolver?: PacketSegmentationResolver,
): Promise<{ documents: IepScanDocument[]; diagnostics: IepSegmentationDiagnostics }> {
  const out: IepScanDocument[] = [];
  const diagnostics: IepSegmentationDiagnostics = {
    uploadCount: documents.length,
    logicalDocumentCount: 0,
    packetCount: 0,
    identityCount: 0,
    validationErrors: [],
    unresolvedPacketUploadIds: [],
  };

  for (const document of documents) {
    const uploadId = document.sourceUploadId ?? document.scanDocumentId;
    if (!packetSegmentationNeeded(document) || !resolver) {
      if (packetSegmentationNeeded(document) && !resolver) {
        diagnostics.unresolvedPacketUploadIds.push(uploadId);
      }
      out.push(...applyLogicalSegmentation(document, identityBoundaries(document)));
      diagnostics.identityCount += 1;
      continue;
    }

    diagnostics.packetCount += 1;
    try {
      const pageCount = Math.max(document.pageCount, document.pages.length);
      const proposed = await resolver.propose({
        sourceDocumentId: document.scanDocumentId,
        displayName: document.originalDisplayName,
        pageCount,
        pages: document.pages,
      });
      const validated = validateLogicalBoundaries(proposed, pageCount);
      if (!validated.ok) {
        diagnostics.validationErrors.push(...validated.errors);
        diagnostics.unresolvedPacketUploadIds.push(uploadId);
        out.push(...applyLogicalSegmentation(document, identityBoundaries(document)));
        diagnostics.identityCount += 1;
        continue;
      }
      out.push(...applyLogicalSegmentation(document, validated.boundaries));
    } catch {
      diagnostics.unresolvedPacketUploadIds.push(uploadId);
      out.push(...applyLogicalSegmentation(document, identityBoundaries(document)));
      diagnostics.identityCount += 1;
    }
  }

  diagnostics.logicalDocumentCount = out.length;
  return { documents: out, diagnostics };
}
