import { createHash } from "node:crypto";

import type { ClaimModality, ClaimValueV4 } from "@hiveforyou/shared/case-intelligence/4";
import type { ReaderExperimentCandidateFact } from "../../../engine/eval/src/reader-experiment/fact-match.js";

type PackFieldRow = {
  fieldId: string;
  valueKind: string;
  value: unknown;
  modality: string;
  missingState: string | null;
  evidence: { sourceDocumentId: string; page: number; quote: string } | null;
};

type PackRecordRow = {
  recordTypeId: string;
  instanceIndex: number;
  fields: PackFieldRow[];
};

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function packValueToClaimValueV4(valueKind: string, value: unknown): ClaimValueV4 | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.kind === "string") {
      return record as ClaimValueV4;
    }
  }

  switch (valueKind) {
    case "text": {
      const textValue =
        typeof value === "string" ? value : readNonEmptyString((value as { textValue?: string }).textValue);
      return textValue ? { kind: "text", textValue } : null;
    }
    case "date": {
      const dateValue =
        typeof value === "string" ? value : readNonEmptyString((value as { dateValue?: string }).dateValue);
      return dateValue ? { kind: "date", dateValue } : null;
    }
    case "code": {
      const codeValue =
        typeof value === "string" ? value : readNonEmptyString((value as { codeValue?: string }).codeValue);
      return codeValue ? { kind: "code", codeValue } : null;
    }
    case "entity_ref": {
      const entityId =
        typeof value === "string" ? value : readNonEmptyString((value as { entityId?: string }).entityId);
      return entityId ? { kind: "entity_ref", entityId } : null;
    }
    case "boolean": {
      if (typeof value === "boolean") {
        return { kind: "boolean", booleanValue: value };
      }
      return null;
    }
    case "quantity": {
      if (typeof value === "number" && Number.isFinite(value)) {
        return { kind: "quantity", numberValue: value, unit: null };
      }
      if (typeof value === "object" && value !== null) {
        const n = (value as { numberValue?: number }).numberValue;
        if (typeof n === "number" && Number.isFinite(n)) {
          const unit = (value as { unit?: string | null }).unit ?? null;
          return { kind: "quantity", numberValue: n, unit };
        }
      }
      return null;
    }
    case "period": {
      if (typeof value !== "object" || value === null) {
        return null;
      }
      const periodStart = readNonEmptyString((value as { periodStart?: string }).periodStart);
      const periodEnd = readNonEmptyString((value as { periodEnd?: string }).periodEnd);
      if (!periodStart || !periodEnd) {
        return null;
      }
      return { kind: "period", periodStart, periodEnd };
    }
    case "unknown":
      return { kind: "unknown" };
    default:
      return null;
  }
}

function candidateId(parts: string[]): string {
  const digest = createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 12);
  return `pdr-${digest}`;
}

function fieldToCandidate(
  sourceDocumentId: string,
  record: PackRecordRow,
  field: PackFieldRow,
): ReaderExperimentCandidateFact | null {
  if (field.missingState !== null || !field.evidence) {
    return null;
  }
  const claimValue = packValueToClaimValueV4(field.valueKind, field.value);
  if (!claimValue) {
    return null;
  }
  const modality = field.modality as ClaimModality;
  const measure = `${record.recordTypeId}.${field.fieldId}`;
  const id = candidateId([
    sourceDocumentId,
    record.recordTypeId,
    String(record.instanceIndex),
    field.fieldId,
    field.evidence.quote.slice(0, 80),
  ]);
  return {
    id,
    construct: { measure, task: null, administration: null },
    value: claimValue,
    modality,
    evidenceRefs: [
      {
        id: `${id}-ev1`,
        sourceDocumentId: field.evidence.sourceDocumentId,
        page: field.evidence.page,
        quote: field.evidence.quote,
        sourceType: "document",
      },
    ],
  };
}

export function packExtractionToCandidateFacts(input: {
  sourceDocumentId: string;
  recordInstances: PackRecordRow[];
}): ReaderExperimentCandidateFact[] {
  const out: ReaderExperimentCandidateFact[] = [];
  for (const record of input.recordInstances) {
    for (const field of record.fields) {
      const candidate = fieldToCandidate(input.sourceDocumentId, record, field);
      if (candidate) {
        out.push(candidate);
      }
    }
  }
  return out;
}
