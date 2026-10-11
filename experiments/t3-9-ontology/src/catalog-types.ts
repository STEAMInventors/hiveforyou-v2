import type { ClaimModality } from "@hiveforyou/shared/case-intelligence/4";
import type { GoldenFactValueKind } from "../../../engine/eval/src/golden/types.js";

export type ExtractionPhase = "atomic" | "relationship";

export type FactCatalogEntry = {
  typeId: string;
  goldenFactId: string;
  atomicField: string;
  subjectScope: string;
  extractionPhase: ExtractionPhase;
  valueKind: GoldenFactValueKind;
  acceptableModalities: ClaimModality[];
  unit: string | null;
  cardinality: { min: number; max: number };
  required: boolean;
  optionalFieldGroup: string | null;
  evidenceRequirements: {
    minQuotes: number;
    requireConsecutiveWords: boolean;
    requirePageLocator: boolean;
  };
  description: string;
};

export type InitialIepFactCatalog = {
  schemaVersion: string;
  documentType: string;
  domainId: string;
  targetDocumentFilename: string;
  goldenTargetCount: number;
  optionalFieldNotes?: Record<string, string>;
  entries: FactCatalogEntry[];
};
