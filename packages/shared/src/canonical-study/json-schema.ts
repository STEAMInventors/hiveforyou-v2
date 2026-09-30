/** JSON Schema for OpenAI strict structured outputs (canonical-study-proposal/2). */

const nullableString = { type: ["string", "null"] as const };
const nullableInteger = { type: ["integer", "null"] as const };

const evidenceReferenceItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    logicalDocumentId: nullableString,
    sourceDocumentId: { type: "string" },
    page: nullableInteger,
    pageEnd: nullableInteger,
    spanStart: nullableInteger,
    spanEnd: nullableInteger,
    sourceType: { type: "string", enum: ["document"] },
    snippet: nullableString,
    extractionId: nullableString,
  },
  required: [
    "id",
    "logicalDocumentId",
    "sourceDocumentId",
    "page",
    "pageEnd",
    "spanStart",
    "spanEnd",
    "sourceType",
    "snippet",
    "extractionId",
  ],
} as const;

const measurementItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    value: { type: "string" },
    unit: nullableString,
    asOf: nullableString,
  },
  required: ["value", "unit", "asOf"],
} as const;

const objectiveRelevanceItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    relatedObjectiveEcho: nullableString,
  },
  required: ["relatedObjectiveEcho"],
} as const;

const claimItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    claimType: { type: "string" },
    subjectEntityId: nullableString,
    statement: { type: "string" },
    isFactual: { type: "boolean" },
    temporalKind: {
      type: ["string", "null"],
      enum: [
        "current",
        "historical",
        "planned",
        "proposed",
        "superseded",
        "continued",
        "unknown",
        null,
      ],
    },
    measurement: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        value: { type: "string" },
        unit: nullableString,
        asOf: nullableString,
      },
      required: ["value", "unit", "asOf"],
    },
    evidenceRefs: { type: "array", items: evidenceReferenceItem },
    objectiveRelevance: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: objectiveRelevanceItem.properties,
      required: objectiveRelevanceItem.required,
    },
  },
  required: [
    "id",
    "claimType",
    "subjectEntityId",
    "statement",
    "isFactual",
    "temporalKind",
    "measurement",
    "evidenceRefs",
    "objectiveRelevance",
  ],
} as const;

const entityItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    entityType: { type: "string" },
    label: { type: "string" },
    sourceDocumentIds: {
      type: ["array", "null"],
      items: { type: "string" },
    },
  },
  required: ["id", "entityType", "label", "sourceDocumentIds"],
} as const;

const relationshipItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    relationshipType: { type: "string" },
    fromEntityId: { type: "string" },
    toEntityId: { type: "string" },
    crossDomain: { type: ["boolean", "null"] },
    evidenceRefs: {
      type: ["array", "null"],
      items: evidenceReferenceItem,
    },
  },
  required: [
    "id",
    "relationshipType",
    "fromEntityId",
    "toEntityId",
    "crossDomain",
    "evidenceRefs",
  ],
} as const;

const eventItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    eventType: { type: "string" },
    label: { type: "string" },
    occurredOn: nullableString,
    entityIds: {
      type: ["array", "null"],
      items: { type: "string" },
    },
    evidenceRefs: {
      type: ["array", "null"],
      items: evidenceReferenceItem,
    },
  },
  required: ["id", "eventType", "label", "occurredOn", "entityIds", "evidenceRefs"],
} as const;

const conflictItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    claimIds: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    severity: { type: "string", enum: ["informational", "material"] },
  },
  required: ["id", "claimIds", "description", "severity"],
} as const;

const missingnessItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    description: { type: "string" },
    relatedDocumentIds: {
      type: ["array", "null"],
      items: { type: "string" },
    },
  },
  required: ["id", "description", "relatedDocumentIds"],
} as const;

const derivedClaimItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    derivedClaimType: { type: "string" },
    statement: { type: "string" },
    basisClaimIds: { type: "array", items: { type: "string" } },
    evidenceRefs: { type: "array", items: evidenceReferenceItem },
  },
  required: ["id", "derivedClaimType", "statement", "basisClaimIds", "evidenceRefs"],
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

export const CANONICAL_STUDY_PROPOSAL_V2_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: { type: "string", const: "canonical-study-proposal/2" },
    domainId: { type: "string" },
    entities: { type: "array", items: entityItem },
    claims: { type: "array", items: claimItem },
    relationships: { type: "array", items: relationshipItem },
    events: { type: "array", items: eventItem },
    conflicts: { type: "array", items: conflictItem },
    missingness: { type: "array", items: missingnessItem },
    derivedClaimCandidates: { type: "array", items: derivedClaimItem },
    warnings: { type: "array", items: { type: "string" } },
    sourceReferences: { type: "array", items: evidenceReferenceItem },
    modelMetadata: modelMetadataItem,
    proposedAt: { type: "string" },
  },
  required: [
    "schemaVersion",
    "domainId",
    "entities",
    "claims",
    "relationships",
    "events",
    "conflicts",
    "missingness",
    "derivedClaimCandidates",
    "warnings",
    "sourceReferences",
    "modelMetadata",
    "proposedAt",
  ],
} as const;
