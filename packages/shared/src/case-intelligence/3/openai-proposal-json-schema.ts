/**
 * JSON Schema for OpenAI strict structured outputs (canonical-study-proposal/3).
 * ClaimValue is a flat nullable object here. Normalization restores the canonical union.
 */

import {
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V5,
  CLAIM_ROLES,
  CONFLICT_KINDS,
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
    snippet: nullableString,
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
    "snippet",
    "extractionId",
    "sourceType",
  ],
} as const;

const effectivePeriodItem = {
  type: "object",
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
} as const;

/**
 * OpenAI Structured Outputs rejects oneOf on this node.
 * Slots stay nullable and required; normalization drops nulls and rebuilds the canonical union.
 * `codeValue` is the code-kind slot (canonical field `code`). Boolean and date do not share `value`.
 */
const claimValueItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: ["quantity", "text", "code", "boolean", "entity_ref", "date", "period", "unknown"],
      description:
        "ClaimValue discriminator. Fill only the slot for this kind and set every other slot to null.",
    },
    numberValue: {
      ...nullableNumber,
      description: "Finite number when kind is quantity; otherwise null. Becomes canonical amount.",
    },
    textValue: {
      ...nullableString,
      description: "Non-empty string when kind is text; otherwise null.",
    },
    codeValue: {
      ...nullableString,
      description: "Non-empty string when kind is code; otherwise null. Becomes canonical code.",
    },
    booleanValue: {
      ...nullableBoolean,
      description: "true or false when kind is boolean; otherwise null. Becomes canonical value.",
    },
    entityId: {
      ...nullableString,
      description: "Entity id when kind is entity_ref; otherwise null.",
    },
    dateValue: {
      ...nullableString,
      description: "Non-empty date string when kind is date; otherwise null. Becomes canonical value.",
    },
    periodStart: {
      ...nullableString,
      description: "Period start when kind is period; null when absent or for any other kind.",
    },
    periodEnd: {
      ...nullableString,
      description: "Period end when kind is period; null when absent or for any other kind.",
    },
    unit: {
      ...nullableString,
      description:
        "Optional unit when kind is quantity; otherwise null. Lifted onto the claim during normalization.",
    },
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

const proposalLineageItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    proposalItemId: { type: "string" },
    studyRunId: { type: "string" },
  },
  required: ["proposalItemId", "studyRunId"],
} as const;

const entityItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    entityType: { type: "string" },
    label: { type: "string" },
    evidenceRefs: { type: "array", items: evidenceReferenceItem },
  },
  required: ["id", "entityType", "label", "evidenceRefs"],
} as const;

const claimItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    subjectEntityId: { type: "string" },
    construct: { type: "string" },
    value: claimValueItem,
    unit: nullableString,
    role: { type: "string", enum: CLAIM_ROLES },
    effectivePeriod: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: effectivePeriodItem.properties,
      required: effectivePeriodItem.required,
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
    "role",
    "effectivePeriod",
    "occurredOn",
    "evidenceRefs",
  ],
} as const;

const conflictItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    claimIds: { type: "array", items: { type: "string" }, minItems: 2 },
    kind: { type: "string", enum: CONFLICT_KINDS },
  },
  required: ["id", "claimIds", "kind"],
} as const;

const missingInformationItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    description: { type: "string" },
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
    "subjectEntityId",
    "relatedConstruct",
    "evidenceRefs",
    "proposalLineage",
  ],
} as const;

const modelMetadataItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    providerId: { type: "string" },
    modelId: nullableString,
    proposalMode: { type: "string", enum: ["fixture", "production"] },
  },
  required: ["providerId", "modelId", "proposalMode"],
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

const voiceProposalItem = {
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
} as const;

export const CANONICAL_STUDY_PROPOSAL_V3_OPENAI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: {
      type: "string",
      enum: [CANONICAL_STUDY_PROPOSAL_SCHEMA_V3],
    },
    domainId: { type: "string" },
    entities: { type: "array", items: entityItem },
    claims: { type: "array", items: claimItem },
    conflicts: { type: "array", items: conflictItem },
    missingInformation: { type: "array", items: missingInformationItem },
    modelMetadata: modelMetadataItem,
    proposedAt: { type: "string" },
  },
  required: [
    "schemaVersion",
    "domainId",
    "entities",
    "claims",
    "conflicts",
    "missingInformation",
    "modelMetadata",
    "proposedAt",
  ],
} as const;

export const CANONICAL_STUDY_PROPOSAL_V5_OPENAI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: {
      type: "string",
      enum: [CANONICAL_STUDY_PROPOSAL_SCHEMA_V5],
    },
    domainId: { type: "string" },
    entities: { type: "array", items: entityItem },
    claims: { type: "array", items: claimItem },
    conflicts: { type: "array", items: conflictItem },
    missingInformation: { type: "array", items: missingInformationItem },
    voiceProposal: voiceProposalItem,
    modelMetadata: modelMetadataItem,
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
