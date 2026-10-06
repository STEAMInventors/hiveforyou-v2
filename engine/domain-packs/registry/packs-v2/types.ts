export type PackValidationError = import("./errors.ts").PackValidationError;

export type JurisdictionOverlayMode = "required" | "none";

export type PackAnchor = {
  name: string;
  fallback: string;
};

export type PackDocumentTypes = {
  distinctive: string[];
  shared: string[];
};

export type CaseAttributeDefinition = {
  values?: string[];
  source?: string;
  proposed_from?: string[];
};

export type PackQuestion = {
  id: string;
  ask: string;
  primitives: string[];
  weight: number;
  per?: string;
  requires?: PackRequireEntry[];
  requires_from?: string;
  track?: string[];
  comparable_on?: string[];
  match?: "model_proposed";
  record?: string;
  audience?: "pro" | "customer" | "both";
  window?: PackOverlayWindow;
  windows_from?: "jurisdiction_overlay";
  threshold?: PackOverlayThreshold;
  applies_when?: Record<string, string[]>;
  runs_when?: { documents_present: string[] };
  as_of?: { case_attribute: string };
  explanation_sources?: string[];
  open_terms?: string[];
};

export type PackRequireEntry = string | { name: string; when?: Record<string, unknown>; parts?: string[] };

export type PackOverlayWindow = {
  from: "jurisdiction_overlay";
  key: string;
  full_calendar_months?: boolean;
};

export type PackOverlayThreshold = {
  from: "jurisdiction_overlay";
  key?: string;
  key_by_chapter?: Record<string, string>;
};

export type PackViews = {
  customer: {
    tone: string;
    forbidden: string[];
    sections: string[];
  };
  pro: {
    templates: Record<string, Record<string, unknown>>;
    export: string[];
  };
};

export type DomainPackV2 = {
  pack: string;
  version: string;
  pro: string;
  anchor: PackAnchor;
  jurisdiction_overlay: JurisdictionOverlayMode;
  questions: PackQuestion[];
  behaviors: Record<string, Record<string, unknown>>;
  views: PackViews;
  case_attributes?: Record<string, CaseAttributeDefinition>;
  document_types?: PackDocumentTypes;
};

export type CoreDefaultsV2 = {
  behaviors: Record<string, Record<string, unknown>>;
};

export type LayersV2 = {
  pro_layer: Record<string, unknown>;
  case_layer: Record<string, unknown>;
  merge: Record<string, unknown>;
};
