import {
  CLAIM_MODALITIES,
  type ClaimModality,
  type ClaimValueV4,
} from "@hiveforyou/shared/case-intelligence/4";
import type { GoldenFactValueKind } from "../../../engine/eval/src/golden/types.js";

import type { CatalogValidationContext } from "./extraction-contract.js";
import { validateClaimValueForKind } from "./extraction-contract.js";

export type OntologyToReaderAdaptResult =
  | { ok: true; wire: Record<string, unknown> }
  | { ok: false; dropReason: string; untranslatableFields: string[] };

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

function readCatalogTypeId(raw: Record<string, unknown>): string | null {
  return readNonEmptyString(raw.catalogTypeId) ?? readNonEmptyString(raw.typeId);
}

function flatValueForKind(raw: Record<string, unknown>, valueKind: GoldenFactValueKind): ClaimValueV4 | null {
  switch (valueKind) {
    case "text": {
      const textValue = readNonEmptyString(raw.textValue ?? raw.text ?? raw.value);
      return textValue ? { kind: "text", textValue } : null;
    }
    case "date": {
      const dateValue = readNonEmptyString(raw.dateValue ?? raw.date);
      return dateValue ? { kind: "date", dateValue } : null;
    }
    case "code": {
      const codeValue = readNonEmptyString(raw.codeValue ?? raw.code);
      return codeValue ? { kind: "code", codeValue } : null;
    }
    case "entity_ref": {
      const entityId = readNonEmptyString(raw.entityId);
      return entityId ? { kind: "entity_ref", entityId } : null;
    }
    case "boolean": {
      if (typeof raw.booleanValue === "boolean") {
        return { kind: "boolean", booleanValue: raw.booleanValue };
      }
      return null;
    }
    case "quantity": {
      if (typeof raw.numberValue !== "number" || !Number.isFinite(raw.numberValue)) {
        return null;
      }
      const unit =
        raw.unit === null || raw.unit === undefined || typeof raw.unit === "string"
          ? (raw.unit ?? undefined)
          : undefined;
      return { kind: "quantity", numberValue: raw.numberValue, unit: unit ?? null };
    }
    case "period": {
      const periodStart =
        raw.periodStart === null || raw.periodStart === undefined
          ? undefined
          : readNonEmptyString(raw.periodStart);
      const periodEnd =
        raw.periodEnd === null || raw.periodEnd === undefined
          ? undefined
          : readNonEmptyString(raw.periodEnd);
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

export function ontologyValueToClaimValueV4(
  raw: unknown,
  valueKind: GoldenFactValueKind,
): { value: ClaimValueV4 | null; untranslatableFields: string[] } {
  const untranslatableFields: string[] = [];

  if (typeof raw === "string") {
    if (valueKind === "period") {
      untranslatableFields.push("value");
      return { value: null, untranslatableFields };
    }
    switch (valueKind) {
      case "text":
        return { value: flatValueForKind({ textValue: raw }, valueKind), untranslatableFields };
      case "date":
        return { value: flatValueForKind({ dateValue: raw }, valueKind), untranslatableFields };
      case "code":
        return { value: flatValueForKind({ codeValue: raw }, valueKind), untranslatableFields };
      case "entity_ref":
        return { value: flatValueForKind({ entityId: raw }, valueKind), untranslatableFields };
      default:
        untranslatableFields.push("value");
        return { value: null, untranslatableFields };
    }
  }

  if (!isRecord(raw)) {
    untranslatableFields.push("value");
    return { value: null, untranslatableFields };
  }

  const withKind = validateClaimValueForKind(raw, valueKind);
  if (withKind) {
    return { value: withKind, untranslatableFields };
  }

  if (valueKind === "period" && readNonEmptyString(raw.textValue ?? raw.period ?? raw.text)) {
    untranslatableFields.push("value");
    return { value: null, untranslatableFields };
  }

  const flat = flatValueForKind(raw, valueKind);
  if (flat) {
    return { value: flat, untranslatableFields };
  }

  untranslatableFields.push("value");
  return { value: null, untranslatableFields };
}

function parseModality(raw: unknown, allowed: ClaimModality[]): ClaimModality {
  if (typeof raw !== "string" || !raw.trim()) {
    return "unknown";
  }
  const modality = raw.trim() as ClaimModality;
  if ((CLAIM_MODALITIES as readonly string[]).includes(modality) && allowed.includes(modality)) {
    return modality;
  }
  if ((CLAIM_MODALITIES as readonly string[]).includes(modality)) {
    return modality;
  }
  return "unknown";
}

function adaptEvidence(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: Array<Record<string, unknown>> = [];
  for (const item of raw) {
    if (!isRecord(item)) {
      continue;
    }
    const sourceDocumentId =
      readNonEmptyString(item.sourceDocumentId) ?? readNonEmptyString(item.documentId);
    const pageRaw = item.page ?? item.pageNumber;
    const page = typeof pageRaw === "number" && Number.isInteger(pageRaw) ? pageRaw : Number(pageRaw);
    const quote =
      readNonEmptyString(item.quote) ??
      readNonEmptyString(item.snippet) ??
      readNonEmptyString(item.text);
    if (!sourceDocumentId || !Number.isFinite(page) || page <= 0 || !quote) {
      continue;
    }
    out.push({ sourceDocumentId, page, quote });
  }
  return out;
}

export function adaptOntologyProposalToReaderWire(
  raw: unknown,
  catalogByTypeId: Map<string, CatalogValidationContext>,
): OntologyToReaderAdaptResult {
  if (!isRecord(raw)) {
    return { ok: false, dropReason: "proposal_not_object", untranslatableFields: ["proposal"] };
  }

  const catalogTypeId = readCatalogTypeId(raw);
  if (!catalogTypeId) {
    return { ok: false, dropReason: "missing_catalog_type_id", untranslatableFields: ["catalogTypeId"] };
  }

  const catalogEntry = catalogByTypeId.get(catalogTypeId);
  if (!catalogEntry) {
    return { ok: false, dropReason: "unknown_catalog_type_id", untranslatableFields: ["catalogTypeId"] };
  }

  const id = readNonEmptyString(raw.id) ?? "ontology-adapt-unknown";
  const constructRaw = raw.construct;
  if (!isRecord(constructRaw)) {
    return { ok: false, dropReason: "missing_construct", untranslatableFields: ["construct"] };
  }
  const measure =
    readNonEmptyString(constructRaw.measure) ?? readNonEmptyString(catalogEntry.atomicField);
  if (!measure) {
    return { ok: false, dropReason: "missing_construct_measure", untranslatableFields: ["construct.measure"] };
  }

  const { value, untranslatableFields } = ontologyValueToClaimValueV4(raw.value, catalogEntry.valueKind);
  if (!value) {
    return {
      ok: false,
      dropReason: "untranslatable_value",
      untranslatableFields: untranslatableFields.length ? untranslatableFields : ["value"],
    };
  }

  const evidence = adaptEvidence(raw.evidence);
  if (evidence.length < catalogEntry.minQuotes) {
    return { ok: false, dropReason: "insufficient_evidence", untranslatableFields: ["evidence"] };
  }

  const modality = parseModality(raw.modality, catalogEntry.acceptableModalities);

  const wire: Record<string, unknown> = {
    id,
    construct: {
      measure,
      task: typeof constructRaw.task === "string" ? constructRaw.task : null,
      administration:
        typeof constructRaw.administration === "string" ? constructRaw.administration : null,
    },
    value,
    modality,
    evidence,
  };

  return { ok: true, wire };
}
