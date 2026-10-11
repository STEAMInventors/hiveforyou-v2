import {
  CLAIM_MODALITIES,
  type ClaimModality,
  type ClaimValueV4,
} from "@hiveforyou/shared/case-intelligence/4";
import type { GoldenFactValueKind } from "../../../engine/eval/src/golden/types.js";

export type OntologyEvidenceRef = {
  sourceDocumentId: string;
  page: number;
  quote: string;
};

export type OntologyConstruct = {
  measure: string;
  task?: string | null;
  administration?: string | null;
};

export type OntologyProposal = {
  id: string;
  catalogTypeId: string;
  construct: OntologyConstruct;
  value: ClaimValueV4;
  modality: ClaimModality;
  evidence: OntologyEvidenceRef[];
};

export type CatalogValidationContext = {
  atomicField: string;
  valueKind: GoldenFactValueKind;
  acceptableModalities: ClaimModality[];
  minQuotes: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateClaimValueForKind(
  raw: unknown,
  expectedKind: GoldenFactValueKind,
): ClaimValueV4 | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (raw.kind !== expectedKind) {
    return null;
  }

  switch (expectedKind) {
    case "text": {
      const textValue = readNonEmptyString(raw.textValue);
      return textValue ? { kind: "text", textValue } : null;
    }
    case "date": {
      const dateValue = readNonEmptyString(raw.dateValue);
      return dateValue ? { kind: "date", dateValue } : null;
    }
    case "code": {
      const codeValue = readNonEmptyString(raw.codeValue);
      return codeValue ? { kind: "code", codeValue } : null;
    }
    case "entity_ref": {
      const entityId = readNonEmptyString(raw.entityId);
      return entityId ? { kind: "entity_ref", entityId } : null;
    }
    case "boolean": {
      return typeof raw.booleanValue === "boolean"
        ? { kind: "boolean", booleanValue: raw.booleanValue }
        : null;
    }
    case "quantity": {
      if (typeof raw.numberValue !== "number" || !Number.isFinite(raw.numberValue)) {
        return null;
      }
      const unit =
        raw.unit === null || raw.unit === undefined
          ? undefined
          : typeof raw.unit === "string"
            ? raw.unit
            : null;
      return { kind: "quantity", numberValue: raw.numberValue, unit };
    }
    case "period": {
      const periodStart =
        raw.periodStart === null || raw.periodStart === undefined
          ? undefined
          : readNonEmptyString(raw.periodStart) ?? null;
      const periodEnd =
        raw.periodEnd === null || raw.periodEnd === undefined
          ? undefined
          : readNonEmptyString(raw.periodEnd) ?? null;
      if (periodStart == null && periodEnd == null) {
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

function parseModality(raw: unknown, allowed: readonly ClaimModality[]): ClaimModality | null {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  const modality = raw.trim() as ClaimModality;
  if (!(CLAIM_MODALITIES as readonly string[]).includes(modality) || !allowed.includes(modality)) {
    return null;
  }
  return modality;
}

function parseConstruct(
  raw: unknown,
  expectedMeasure: string,
): { construct: OntologyConstruct } | null {
  if (!isRecord(raw)) {
    return null;
  }
  const measure = readNonEmptyString(raw.measure);
  if (!measure || measure !== expectedMeasure) {
    return null;
  }
  const task =
    raw.task === null || raw.task === undefined
      ? null
      : typeof raw.task === "string"
        ? raw.task
        : null;
  const administration =
    raw.administration === null || raw.administration === undefined
      ? null
      : typeof raw.administration === "string"
        ? raw.administration
        : null;
  return { construct: { measure, task, administration } };
}

function parseEvidence(raw: unknown, minQuotes: number): OntologyEvidenceRef[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const evidence: OntologyEvidenceRef[] = [];
  for (const item of raw) {
    if (!isRecord(item)) {
      continue;
    }
    const sourceDocumentId = readNonEmptyString(item.sourceDocumentId);
    const page =
      typeof item.page === "number" && Number.isInteger(item.page) && item.page > 0 ? item.page : null;
    const quote = readNonEmptyString(item.quote);
    if (!sourceDocumentId || page == null || !quote) {
      continue;
    }
    evidence.push({ sourceDocumentId, page, quote });
  }
  return evidence.length >= minQuotes ? evidence : null;
}

export function parseOntologyProposal(
  raw: unknown,
  index: number,
  catalogByTypeId: Map<string, CatalogValidationContext>,
): OntologyProposal | null {
  if (!isRecord(raw)) {
    return null;
  }

  const id = readNonEmptyString(raw.id) ?? `ontology-${index + 1}`;
  const catalogTypeId = readNonEmptyString(raw.catalogTypeId);
  if (!catalogTypeId) {
    return null;
  }

  const catalogEntry = catalogByTypeId.get(catalogTypeId);
  if (!catalogEntry) {
    return null;
  }

  const constructParsed = parseConstruct(raw.construct, catalogEntry.atomicField);
  if (!constructParsed) {
    return null;
  }

  const value = validateClaimValueForKind(raw.value, catalogEntry.valueKind);
  if (!value) {
    return null;
  }

  const modality = parseModality(raw.modality, catalogEntry.acceptableModalities);
  if (!modality) {
    return null;
  }

  const evidence = parseEvidence(raw.evidence, catalogEntry.minQuotes);
  if (!evidence) {
    return null;
  }

  return {
    id,
    catalogTypeId,
    construct: constructParsed.construct,
    value,
    modality,
    evidence,
  };
}

export function parseOntologyExtractionResponse(
  parsed: unknown,
  catalogByTypeId: Map<string, CatalogValidationContext>,
): { proposals: OntologyProposal[]; dropped: number } {
  if (!isRecord(parsed) || !Array.isArray(parsed.proposals)) {
    return { proposals: [], dropped: 0 };
  }

  const proposals: OntologyProposal[] = [];
  let dropped = 0;

  for (const [index, item] of parsed.proposals.entries()) {
    const proposal = parseOntologyProposal(item, index, catalogByTypeId);
    if (!proposal) {
      dropped += 1;
      continue;
    }
    proposals.push(proposal);
  }

  return { proposals, dropped };
}
