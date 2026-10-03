import type { DiscoverCatalogEntry } from "@hiveforyou/domain-pack";

import { IEP_DISCOVER_CATALOG } from "../document-types";

/** Filename hints already stored on the IEP discover catalog. */
export function iepCatalogFilenameRules(): readonly DiscoverCatalogEntry[] {
  return IEP_DISCOVER_CATALOG.filter((entry) => entry.filenameHints.length > 0);
}
