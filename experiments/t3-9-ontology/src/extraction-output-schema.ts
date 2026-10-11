import { CLAIM_MODALITIES } from "@hiveforyou/shared/case-intelligence/4";
import type { ModelTextFormat } from "@hiveforyou/shared/model/call-model";

import type { InitialIepFactCatalog } from "./catalog-types.js";

/** Value kinds the strict parser accepts (ClaimValueV4). */
export const OUTPUT_VALUE_KINDS = [
  "quantity",
  "text",
  "code",
  "boolean",
  "entity_ref",
  "date",
  "period",
  "unknown",
] as const;

const CLAIM_VALUE_FIELD_DOCS: Record<(typeof OUTPUT_VALUE_KINDS)[number], string> = {
  quantity:
    '{ "kind": "quantity", "numberValue": <number>, "unit"?: <string|null> } — use catalog unit when listed',
  text: '{ "kind": "text", "textValue": <non-empty string> }',
  code: '{ "kind": "code", "codeValue": <non-empty string> }',
  boolean: '{ "kind": "boolean", "booleanValue": <true|false> }',
  entity_ref: '{ "kind": "entity_ref", "entityId": <non-empty string> }',
  date: '{ "kind": "date", "dateValue": <ISO date string YYYY-MM-DD> }',
  period:
    '{ "kind": "period", "periodStart"?: <ISO date|null>, "periodEnd"?: <ISO date|null> } — at least one bound required',
  unknown: '{ "kind": "unknown" } — no other value fields',
};

export function formatClaimValueV4Instructions(): string {
  return [
    "ClaimValueV4 (value object) — kind must match the catalog row valueKind; include only fields for that kind:",
    ...OUTPUT_VALUE_KINDS.map((kind) => `- ${kind}: ${CLAIM_VALUE_FIELD_DOCS[kind]}`),
  ].join("\n");
}

export function formatCatalogValueHints(catalog: InitialIepFactCatalog): string {
  const lines = catalog.entries.map((entry) => {
    const unitHint = entry.unit ? `; emit unit="${entry.unit}" on quantity values` : "";
    return `- ${entry.typeId} (valueKind=${entry.valueKind}): ${CLAIM_VALUE_FIELD_DOCS[entry.valueKind]}${unitHint}`;
  });
  return ["Per catalog type (value must match valueKind):", ...lines].join("\n");
}

export function formatProposalEnvelopeInstructions(): string {
  return [
    'Top-level JSON: { "proposals": [ ... ] }',
    "Each proposal (strict parser fields only):",
    '- "id": string',
    '- "catalogTypeId": string — must match a catalog typeId',
    '- "construct": { "measure": string (must equal catalog atomicField), "task"?: string|null, "administration"?: string|null }',
    '- "value": ClaimValueV4 — see value shapes above',
    '- "modality": one of planned|required|decided|observed|unknown (must be allowed for that catalog type)',
    '- "evidence": [ { "sourceDocumentId": string, "page": positive integer, "quote": non-empty string } ] — min quotes per catalog row',
  ].join("\n");
}

const claimValueJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: [...OUTPUT_VALUE_KINDS] },
    textValue: { type: "string" },
    dateValue: { type: "string" },
    codeValue: { type: "string" },
    entityId: { type: "string" },
    booleanValue: { type: "boolean" },
    numberValue: { type: "number" },
    unit: { type: "string" },
    periodStart: { type: "string" },
    periodEnd: { type: "string" },
  },
  required: ["kind"],
} as const;

const evidenceItemJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sourceDocumentId: { type: "string" },
    page: { type: "integer" },
    quote: { type: "string" },
  },
  required: ["sourceDocumentId", "page", "quote"],
} as const;

export function buildOntologyExtractionOutputSchema(
  catalog: InitialIepFactCatalog,
): Extract<ModelTextFormat, { type: "json_schema" }> {
  const catalogTypeIds = catalog.entries.map((e) => e.typeId);

  return {
    type: "json_schema",
    name: "ontology_extraction",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        proposals: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              catalogTypeId: { type: "string", enum: catalogTypeIds },
              construct: {
                type: "object",
                additionalProperties: false,
                properties: {
                  measure: { type: "string" },
                  task: { type: "string" },
                  administration: { type: "string" },
                },
                required: ["measure"],
              },
              value: claimValueJsonSchema,
              modality: { type: "string", enum: [...CLAIM_MODALITIES] },
              evidence: {
                type: "array",
                items: evidenceItemJsonSchema,
                minItems: 1,
              },
            },
            required: ["id", "catalogTypeId", "construct", "value", "modality", "evidence"],
          },
        },
      },
      required: ["proposals"],
    },
  };
}
