import type { DiscoverCatalogEntry } from "@hiveforyou/domain-pack";

import { IEP_DISCOVER_CATALOG } from "../document-types";

/**
 * Match a filename to an IEP catalog entry using that entry's filename hints.
 * This does not read document text. Text classification stays with the model proposal.
 */
export function classifyLogicalDocumentByFilename(filename: string): DiscoverCatalogEntry | null {
  const normalized = filename.toLowerCase();
  for (const entry of IEP_DISCOVER_CATALOG) {
    if (entry.filenameHints.some((hint) => normalized.includes(hint.toLowerCase()))) {
      return entry;
    }
  }
  return null;
}
