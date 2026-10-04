import type { StructureMapLogicalDocument } from "@hiveforyou/shared/discover";

/**
 * Evidence refs store page numbers in physical source-document space (validated
 * against Structure Map logical bounds). Returns the 1-based page within the
 * logical document segment when mappable.
 */
export function logicalPageNumberFromPhysical(
  logical: StructureMapLogicalDocument,
  physicalPage: number,
): number | null {
  if (physicalPage < logical.pageStart) {
    return null;
  }
  const end = logical.pageEnd ?? logical.pageStart;
  if (physicalPage > end) {
    return null;
  }
  return physicalPage - logical.pageStart + 1;
}

/** Physical page in the source upload for a validated evidence ref page field. */
export function physicalPageFromEvidenceRef(page: number | undefined): number | null {
  if (page === undefined || !Number.isInteger(page) || page < 1) {
    return null;
  }
  return page;
}
