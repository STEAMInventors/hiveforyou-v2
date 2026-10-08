import type { ClaimModality, ClaimValueV4 } from "@hiveforyou/shared/case-intelligence/4";

/** hive-study-baseline/1 — validated accepted claims slice from T0.2 capture. */
export type StudyBaseline = {
  schemaVersion: string;
  caseId: string;
  promptVersion: string;
  runStatus?: string;
  validationStatus?: string;
  acceptedClaims?: BaselineAcceptedClaim[];
  proposalModelMetadata?: {
    providerId?: string;
    modelId?: string;
    proposalMode?: string;
  } | null;
};

export type BaselineEvidenceRef = {
  id: string;
  sourceDocumentId: string;
  logicalDocumentId?: string;
  page?: number;
  pageEnd?: number;
  extractionId?: string;
  snippet?: string;
  quote?: string;
  sourceType?: "document";
};

/** Validated claim row as persisted by baseline-study (v3 / internal validation shape). */
export type BaselineAcceptedClaim = {
  id: string;
  subjectEntityId: string;
  construct: string;
  value: BaselineClaimValue;
  unit?: string;
  role?: ClaimModality | string;
  modality?: ClaimModality;
  effectivePeriod?: { start?: string; end?: string; precision?: string };
  occurredOn?: string;
  evidenceRefs: BaselineEvidenceRef[];
};

export type BaselineClaimValue =
  | { kind: "quantity"; amount: number }
  | { kind: "text"; text: string }
  | { kind: "code"; code: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "entity_ref"; entityId: string }
  | { kind: "date"; value: string }
  | { kind: "period"; start?: string; end?: string }
  | { kind: "unknown" };

export function baselineClaimValueToV4(value: BaselineClaimValue): ClaimValueV4 {
  switch (value.kind) {
    case "quantity":
      return { kind: "quantity", numberValue: value.amount, unit: null };
    case "text":
      return { kind: "text", textValue: value.text };
    case "code":
      return { kind: "code", codeValue: value.code };
    case "boolean":
      return { kind: "boolean", booleanValue: value.value };
    case "entity_ref":
      return { kind: "entity_ref", entityId: value.entityId };
    case "date":
      return { kind: "date", dateValue: value.value };
    case "period":
      return {
        kind: "period",
        periodStart: value.start ?? null,
        periodEnd: value.end ?? null,
      };
    default:
      return { kind: "unknown" };
  }
}
