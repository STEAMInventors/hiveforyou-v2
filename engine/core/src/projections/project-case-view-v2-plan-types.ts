import type { Chip, DisplayValue } from "@hiveforyou/shared/projections";

export type FactRow = {
  itemId: string;
  claimId: string | null;
  measure: string;
  task: string | null;
  logicalDocumentId: string;
  documentSortKey: string;
  display: DisplayValue;
  chips: Chip[];
  isPlanDoc: boolean;
};
