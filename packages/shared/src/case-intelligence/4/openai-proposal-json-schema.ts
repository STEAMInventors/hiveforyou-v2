import {
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V4,
  CLAIM_MODALITIES,
  CONFLICT_KINDS,
  MISSING_GAP_KINDS,
} from "./types";

const nullableString = { type: ["string", "null"] as const };
const nullableNumber = { type: ["number", "null"] as const };
const nullableBoolean = { type: ["boolean", "null"] as const };
const nullableInteger = { type: ["integer", "null"] as const, minimum: 1 };
const nullableIntegerSpan = { type: ["integer", "null"] as const, minimum: 0 };

const evidenceReferenceItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    sourceDocumentId: { type: "string" },
    logicalDocumentId: nullableString,
    page: nullableInteger,
    pageEnd: nullableInteger,
    spanStart: nullableIntegerSpan,
    spanEnd: nullableIntegerSpan,
    quote: { type: "string" },
    extractionId: nullableString,
    sourceType: { type: "string", enum: ["document"] },
  },
  required: [
    "id",
    "sourceDocumentId",
    "logicalDocumentId",
    "page",
    "pageEnd",
    "spanStart",
    "spanEnd",
    "quote",
    "extractionId",
    "sourceType",
  ],
} as const;

const voiceProposalTokenItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    value: nullableString,
    from: { type: ["string", "null"], enum: ["user_text", "document", null] },
    evidenceRefs: {
      type: ["array", "null"],
      items: evidenceReferenceItem,
    },
  },
  required: ["value", "from", "evidenceRefs"],
} as const;

const claimValueItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: ["quantity", "text", "code", "boolean", "entity_ref", "date", "period", "unknown"],
    },
    numberValue: nullableNumber,
    textValue: nullableString,
    codeValue: nullableString,
    booleanValue: nullableBoolean,
    entityId: nullableString,
    dateValue: nullableString,
    periodStart: nullableString,
    periodEnd: nullableString,
    unit: nullableString,
  },
  required: [
    "kind",
    "numberValue",
    "textValue",
    "codeValue",
    "booleanValue",
    "entityId",
    "dateValue",
    "periodStart",
    "periodEnd",
    "unit",
  ],
} as const;

const constructPartsItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    measure: { type: "string" },
    task: nullableString,
    administration: nullableString,
  },
  required: ["measure", "task", "administration"],
} as const;

const proposalLineageItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    proposalItemId: { type: "string" },
    studyRunId: { type: "string" },
  },
  required: ["proposalItemId", "studyRunId"],
} as const;

export const CANONICAL_STUDY_PROPOSAL_V4_OPENAI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: {
      type: "string",
      enum: [CANONICAL_STUDY_PROPOSAL_SCHEMA_V4],
    },
    domainId: { type: "string" },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          entityType: { type: "string" },
          label: { type: "string" },
          aliases: { type: ["array", "null"], items: { type: "string" } },
          evidenceRefs: { type: "array", items: evidenceReferenceItem },
        },
        required: ["id", "entityType", "label", "aliases", "evidenceRefs"],
      },
    },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          subjectEntityId: { type: "string" },
          construct: constructPartsItem,
          value: claimValueItem,
          unit: nullableString,
          modality: { type: "string", enum: CLAIM_MODALITIES },
          effectivePeriod: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              start: nullableString,
              end: nullableString,
              precision: {
                type: ["string", "null"],
                enum: ["day", "month", "year", "unknown", null],
              },
            },
            required: ["start", "end", "precision"],
          },
          occurredOn: nullableString,
          evidenceRefs: { type: "array", items: evidenceReferenceItem },
        },
        required: [
          "id",
          "subjectEntityId",
          "construct",
          "value",
          "unit",
          "modality",
          "effectivePeriod",
          "occurredOn",
          "evidenceRefs",
        ],
      },
    },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          claimIds: { type: "array", items: { type: "string" }, minItems: 2 },
          kind: { type: "string", enum: CONFLICT_KINDS },
        },
        required: ["id", "claimIds", "kind"],
      },
    },
    missingInformation: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          description: { type: "string" },
          gapKind: { type: "string", enum: MISSING_GAP_KINDS },
          subjectEntityId: nullableString,
          relatedConstruct: nullableString,
          evidenceRefs: {
            type: ["array", "null"],
            items: evidenceReferenceItem,
          },
          proposalLineage: proposalLineageItem,
        },
        required: [
          "id",
          "description",
          "gapKind",
          "subjectEntityId",
          "relatedConstruct",
          "evidenceRefs",
          "proposalLineage",
        ],
      },
    },
    voiceProposal: {
      type: "object",
      additionalProperties: false,
      properties: {
        subject: voiceProposalTokenItem,
        eventNoun: voiceProposalTokenItem,
        helperNoun: voiceProposalTokenItem,
        otherPartyNoun: voiceProposalTokenItem,
        subjectName: voiceProposalTokenItem,
      },
      required: ["subject", "eventNoun", "helperNoun", "otherPartyNoun", "subjectName"],
    },
    modelMetadata: {
      type: "object",
      additionalProperties: false,
      properties: {
        providerId: { type: "string" },
        modelId: nullableString,
        proposalMode: { type: "string", enum: ["fixture", "production"] },
      },
      required: ["providerId", "modelId", "proposalMode"],
    },
    proposedAt: { type: "string" },
  },
  required: [
    "schemaVersion",
    "domainId",
    "entities",
    "claims",
    "conflicts",
    "missingInformation",
    "voiceProposal",
    "modelMetadata",
    "proposedAt",
  ],
} as const;
