/**
 * Generic logical page-boundary validation for multi-document uploads.
 * Domain packs supply proposal adapters; this layer validates structure only.
 */

export type LogicalPageBoundary = {
  logicalDocumentId: string;
  sourceUploadId: string;
  startPage: number;
  endPage: number;
  confidence: number;
  /** When true, an intentional gap before this range is allowed (unknown filler pages). */
  unknown?: boolean;
};

export type ValidateLogicalPageBoundariesResult = {
  ok: boolean;
  boundaries: LogicalPageBoundary[];
  errors: string[];
};

export function validateLogicalPageBoundaries(
  boundaries: LogicalPageBoundary[],
  pageCount: number,
): ValidateLogicalPageBoundariesResult {
  const errors: string[] = [];
  if (!boundaries.length) {
    return { ok: false, boundaries: [], errors: ["empty_boundaries"] };
  }
  const ordered = boundaries
    .slice()
    .sort((a, b) => a.startPage - b.startPage || a.endPage - b.endPage);
  let cursor = 1;
  for (const [i, row] of ordered.entries()) {
    if (!Number.isInteger(row.startPage) || !Number.isInteger(row.endPage)) {
      errors.push("non_integer_page");
      continue;
    }
    if (row.startPage < 1 || row.endPage > pageCount || row.startPage > row.endPage) {
      errors.push("range_out_of_bounds");
    }
    const previous = i > 0 ? ordered[i - 1] : undefined;
    if (previous !== undefined && row.startPage <= previous.endPage) {
      errors.push("overlapping_ranges");
    }
    if (row.startPage > cursor) {
      if (!row.unknown && !previous?.unknown) {
        errors.push("unexplained_gap");
      }
    }
    cursor = row.endPage + 1;
  }
  if (cursor <= pageCount) {
    const last = ordered[ordered.length - 1];
    if (!last?.unknown) {
      errors.push("trailing_gap");
    }
  }
  return { ok: errors.length === 0, boundaries: ordered, errors };
}

export type PacketSegmentationProposeInput = {
  sourceDocumentId: string;
  displayName: string;
  pageCount: number;
  pages: Array<{ pageNumber: number; text: string }>;
};

/** Optional semantic proposal adapter (model or other). Output is never canonical until validated. */
export type PacketSegmentationResolver = {
  propose(input: PacketSegmentationProposeInput): Promise<LogicalPageBoundary[]>;
};
