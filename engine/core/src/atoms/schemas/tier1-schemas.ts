import type { ModelJsonSchemaFormat } from "../../model/call-model";

export const TIER1_PROFILE_JSON_SCHEMA: ModelJsonSchemaFormat = {
  type: "json_schema",
  name: "atom_document_profile",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "purpose", "issuedDate", "periodFrom", "periodTo", "parties", "references", "requests", "terms"],
    properties: {
      kind: { type: ["string", "null"] },
      purpose: { type: ["string", "null"] },
      issuedDate: { type: ["string", "null"] },
      periodFrom: { type: ["string", "null"] },
      periodTo: { type: ["string", "null"] },
      parties: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "role", "quote"],
          properties: {
            name: { type: "string" },
            role: { type: ["string", "null"] },
            quote: { type: "string" },
          },
        },
      },
      references: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["description", "quote"],
          properties: {
            description: { type: "string" },
            quote: { type: "string" },
          },
        },
      },
      requests: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "quote"],
          properties: {
            text: { type: "string" },
            quote: { type: "string" },
          },
        },
      },
      terms: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "quote"],
          properties: {
            text: { type: "string" },
            quote: { type: "string" },
          },
        },
      },
    },
  },
};

export const TIER1_STATEMENTS_JSON_SCHEMA: ModelJsonSchemaFormat = {
  type: "json_schema",
  name: "atom_prose_statements",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["statements"],
    properties: {
      statements: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "subjectLabel",
            "attributeRaw",
            "attributeKey",
            "valueRaw",
            "force",
            "appliesFrom",
            "appliesTo",
            "conditionRaw",
            "quote",
          ],
          properties: {
            subjectLabel: { type: "string" },
            attributeRaw: { type: "string" },
            attributeKey: { type: ["string", "null"] },
            valueRaw: { type: ["string", "null"] },
            force: { type: "string" },
            appliesFrom: { type: ["string", "null"] },
            appliesTo: { type: ["string", "null"] },
            conditionRaw: { type: ["string", "null"] },
            quote: { type: "string" },
          },
        },
      },
    },
  },
};
