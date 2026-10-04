import { formatScanSubtype } from "../document-interpreter/classify-local";
import type { IepLocalClassification } from "../document-interpreter/contracts";

export function customerLabelForClassification(classification: IepLocalClassification): string {
  if (classification.subtype) {
    return formatScanSubtype(classification.subtype);
  }
  if (classification.family === "OTHER") {
    return "Other educational document";
  }
  return classification.family.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
