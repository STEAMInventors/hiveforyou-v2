import {
  CLAIM_ROLES,
  CONFLICT_KINDS,
  UNRESOLVED_ITEM_KINDS,
  UNRESOLVED_SOURCES,
  CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,
  CASE_INTELLIGENCE_SCHEMA_V3,
} from "./types";

/** Subset of JSON Schema used to validate case-intelligence/3 documents. */
export type JsonSchema = {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean";
  const?: string | number | boolean;
  enum?: readonly (string | number | boolean)[];
  properties?: Readonly<Record<string, JsonSchema>>;
  required?: readonly string[];
  additionalProperties?: false;
  items?: JsonSchema;
  oneOf?: readonly JsonSchema[];
  anyOf?: readonly JsonSchema[];
  if?: JsonSchema;
  then?: JsonSchema;
  minItems?: number;
  minLength?: number;
  minimum?: number;
};

const nonEmptyString: JsonSchema = { type: "string", minLength: 1 };

/** OpenAI Structured Outputs requires an explicit `type` on every leaf schema (use enum, not bare const). */
function stringLiteral(value: string): JsonSchema {
  return { type: "string", enum: [value] };
}

const claimRoleSchema: JsonSchema = { type: "string", enum: CLAIM_ROLES };

const conflictKindSchema: JsonSchema = { type: "string", enum: CONFLICT_KINDS };

const effectivePeriodSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    start: nonEmptyString,
    end: nonEmptyString,
    precision: { type: "string", enum: ["day", "month", "year", "unknown"] },
  },
  required: [],
};

const quantityValue: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: stringLiteral("quantity"),
    amount: { type: "number" },
  },
  required: ["kind", "amount"],
};

const textValue: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: stringLiteral("text"),
    text: nonEmptyString,
  },
  required: ["kind", "text"],
};

const codeValue: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: stringLiteral("code"),
    code: nonEmptyString,
  },
  required: ["kind", "code"],
};

const booleanValue: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: stringLiteral("boolean"),
    value: { type: "boolean" },
  },
  required: ["kind", "value"],
};

const entityRefValue: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: stringLiteral("entity_ref"),
    entityId: nonEmptyString,
  },
  required: ["kind", "entityId"],
};

const dateValue: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: stringLiteral("date"),
    value: nonEmptyString,
  },
  required: ["kind", "value"],
};

const periodValue: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: stringLiteral("period"),
    start: nonEmptyString,
    end: nonEmptyString,
  },
  required: ["kind"],
};

const unknownValue: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: stringLiteral("unknown"),
  },
  required: ["kind"],
};

export const CLAIM_VALUE_V3_JSON_SCHEMA: JsonSchema = {
  oneOf: [
    quantityValue,
    textValue,
    codeValue,
    booleanValue,
    entityRefValue,
    dateValue,
    periodValue,
    unknownValue,
  ],
};

/**
 * Source location only. proposalItemId, studyRunId, and proposalLineage are rejected.
 * At least one of page, spanStart, spanEnd, or snippet is required.
 */
export const EVIDENCE_REFERENCE_V3_JSON_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    sourceDocumentId: nonEmptyString,
    logicalDocumentId: nonEmptyString,
    page: { type: "integer", minimum: 1 },
    pageEnd: { type: "integer", minimum: 1 },
    spanStart: { type: "integer", minimum: 0 },
    spanEnd: { type: "integer", minimum: 0 },
    snippet: nonEmptyString,
    extractionId: nonEmptyString,
    sourceType: stringLiteral("document"),
  },
  required: ["id", "sourceDocumentId", "sourceType"],
  anyOf: [
    { type: "object", required: ["page"] },
    { type: "object", required: ["spanStart"] },
    { type: "object", required: ["spanEnd"] },
    { type: "object", required: ["snippet"] },
  ],
};

export const PROPOSAL_LINEAGE_V3_JSON_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    proposalItemId: nonEmptyString,
    studyRunId: nonEmptyString,
  },
  required: ["proposalItemId", "studyRunId"],
};

const evidenceRefArray: JsonSchema = {
  type: "array",
  items: EVIDENCE_REFERENCE_V3_JSON_SCHEMA,
};

const proposedEntitySchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    entityType: nonEmptyString,
    label: nonEmptyString,
    evidenceRefs: evidenceRefArray,
  },
  required: ["id", "entityType", "label", "evidenceRefs"],
};

const proposedClaimSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    subjectEntityId: nonEmptyString,
    construct: nonEmptyString,
    value: CLAIM_VALUE_V3_JSON_SCHEMA,
    unit: nonEmptyString,
    role: claimRoleSchema,
    effectivePeriod: effectivePeriodSchema,
    occurredOn: nonEmptyString,
    evidenceRefs: evidenceRefArray,
  },
  required: ["id", "subjectEntityId", "construct", "value", "role", "evidenceRefs"],
};

const proposedConflictSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    claimIds: { type: "array", items: nonEmptyString, minItems: 2 },
    kind: conflictKindSchema,
  },
  required: ["id", "claimIds", "kind"],
};

/** Optional refs; when present each ref must satisfy chip locator rules. */
const optionalEvidenceRefArray: JsonSchema = {
  type: "array",
  items: EVIDENCE_REFERENCE_V3_JSON_SCHEMA,
};

const proposedMissingInformationSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    description: nonEmptyString,
    subjectEntityId: nonEmptyString,
    relatedConstruct: nonEmptyString,
    evidenceRefs: optionalEvidenceRefArray,
    proposalLineage: PROPOSAL_LINEAGE_V3_JSON_SCHEMA,
  },
  required: ["id", "description", "proposalLineage"],
};

const modelMetadataSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    providerId: nonEmptyString,
    modelId: nonEmptyString,
    proposalMode: { type: "string", enum: ["fixture", "production"] },
  },
  required: ["providerId", "proposalMode"],
};

export const CANONICAL_STUDY_PROPOSAL_V3_JSON_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: stringLiteral(CANONICAL_STUDY_PROPOSAL_SCHEMA_V3),
    domainId: nonEmptyString,
    entities: { type: "array", items: proposedEntitySchema },
    claims: { type: "array", items: proposedClaimSchema },
    conflicts: { type: "array", items: proposedConflictSchema },
    missingInformation: { type: "array", items: proposedMissingInformationSchema },
    modelMetadata: modelMetadataSchema,
    proposedAt: nonEmptyString,
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
};

const validatedClaimSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    domainId: nonEmptyString,
    subjectEntityId: nonEmptyString,
    construct: nonEmptyString,
    value: CLAIM_VALUE_V3_JSON_SCHEMA,
    unit: nonEmptyString,
    role: claimRoleSchema,
    effectivePeriod: effectivePeriodSchema,
    occurredOn: nonEmptyString,
    evidenceRefs: evidenceRefArray,
    proposalLineage: PROPOSAL_LINEAGE_V3_JSON_SCHEMA,
  },
  required: [
    "id",
    "domainId",
    "subjectEntityId",
    "construct",
    "value",
    "role",
    "evidenceRefs",
    "proposalLineage",
  ],
};

const canonicalEventSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    claimId: nonEmptyString,
    construct: nonEmptyString,
    subjectEntityId: nonEmptyString,
    occurredOn: nonEmptyString,
    effectivePeriod: effectivePeriodSchema,
    evidenceRefs: evidenceRefArray,
    timelineOrderHint: { type: "integer", minimum: 0 },
  },
  required: ["id", "claimId", "construct", "subjectEntityId", "evidenceRefs"],
  anyOf: [{ required: ["occurredOn"] }, { required: ["effectivePeriod"] }],
};

const conflictSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    claimIds: { type: "array", items: nonEmptyString, minItems: 2 },
    kind: conflictKindSchema,
    subjectEntityId: nonEmptyString,
    construct: nonEmptyString,
  },
  required: ["id", "claimIds", "kind"],
};

const changeSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    subjectEntityId: nonEmptyString,
    construct: nonEmptyString,
    fromClaimId: nonEmptyString,
    toClaimId: nonEmptyString,
  },
  required: ["id", "subjectEntityId", "construct", "fromClaimId", "toClaimId"],
};

const unresolvedItemSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    kind: { type: "string", enum: UNRESOLVED_ITEM_KINDS },
    source: { type: "string", enum: UNRESOLVED_SOURCES },
    description: nonEmptyString,
    subjectEntityId: nonEmptyString,
    relatedConstruct: nonEmptyString,
    relatedClaimIds: { type: "array", items: nonEmptyString },
    relatedLogicalDocumentIds: { type: "array", items: nonEmptyString },
    evidenceRefs: optionalEvidenceRefArray,
    proposalLineage: PROPOSAL_LINEAGE_V3_JSON_SCHEMA,
  },
  required: ["id", "kind", "source"],
  if: {
    properties: { kind: stringLiteral("missing_information") },
    required: ["kind"],
  },
  then: { required: ["description"] },
};

const domainSliceSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    domainId: nonEmptyString,
    studyRunId: nonEmptyString,
    domainPackId: nonEmptyString,
    domainPackVersion: nonEmptyString,
  },
  required: ["domainId", "studyRunId", "domainPackId", "domainPackVersion"],
};

/** Running /2 evidence ref nested inside CanonicalStudyValidationResult. Locator rule is not applied. */
const validationEvidenceSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    logicalDocumentId: nonEmptyString,
    sourceDocumentId: nonEmptyString,
    page: { type: "integer", minimum: 1 },
    pageEnd: { type: "integer", minimum: 1 },
    spanStart: { type: "integer", minimum: 0 },
    spanEnd: { type: "integer", minimum: 0 },
    sourceType: stringLiteral("document"),
    snippet: nonEmptyString,
    extractionId: nonEmptyString,
  },
  required: ["id", "sourceDocumentId", "sourceType"],
};

const validationIssueSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    code: nonEmptyString,
    message: nonEmptyString,
    severity: { type: "string", enum: ["warning", "reject", "fatal"] },
    requiresHumanAdjudication: { type: "boolean" },
    path: nonEmptyString,
    relatedIds: { type: "array", items: nonEmptyString },
  },
  required: ["code", "message", "severity"],
};

const validationEntitySchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    entityType: nonEmptyString,
    label: nonEmptyString,
    sourceDocumentIds: { type: "array", items: nonEmptyString },
  },
  required: ["id", "entityType", "label"],
};

const validationClaimSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    claimType: nonEmptyString,
    subjectEntityId: nonEmptyString,
    statement: nonEmptyString,
    isFactual: { type: "boolean" },
    temporalKind: {
      type: "string",
      enum: ["current", "historical", "planned", "proposed", "superseded", "continued", "unknown"],
    },
    measurement: {
      type: "object",
      additionalProperties: false,
      properties: {
        value: { oneOf: [{ type: "number" }, nonEmptyString] },
        unit: nonEmptyString,
        asOf: nonEmptyString,
      },
      required: ["value"],
    },
    evidenceRefs: { type: "array", items: validationEvidenceSchema },
    objectiveRelevance: {
      type: "object",
      additionalProperties: false,
      properties: { relatedObjectiveEcho: nonEmptyString },
      required: [],
    },
  },
  required: ["id", "claimType", "statement", "isFactual", "evidenceRefs"],
};

const validationRelationshipSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    relationshipType: nonEmptyString,
    fromEntityId: nonEmptyString,
    toEntityId: nonEmptyString,
    crossDomain: { type: "boolean" },
    evidenceRefs: { type: "array", items: validationEvidenceSchema },
  },
  required: ["id", "relationshipType", "fromEntityId", "toEntityId"],
};

const validationEventSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    eventType: nonEmptyString,
    label: nonEmptyString,
    occurredOn: nonEmptyString,
    entityIds: { type: "array", items: nonEmptyString },
    evidenceRefs: { type: "array", items: validationEvidenceSchema },
  },
  required: ["id", "eventType", "label"],
};

const validationConflictSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    claimIds: { type: "array", items: nonEmptyString },
    description: nonEmptyString,
    severity: { type: "string", enum: ["informational", "material"] },
  },
  required: ["id", "claimIds", "description", "severity"],
};

const validationMissingnessSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    description: nonEmptyString,
    relatedDocumentIds: { type: "array", items: nonEmptyString },
  },
  required: ["id", "description"],
};

const validationDerivedSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: nonEmptyString,
    derivedClaimType: nonEmptyString,
    statement: nonEmptyString,
    basisClaimIds: { type: "array", items: nonEmptyString },
    evidenceRefs: { type: "array", items: validationEvidenceSchema },
  },
  required: ["id", "derivedClaimType", "statement", "basisClaimIds", "evidenceRefs"],
};

const validationResultSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["SUCCEEDED", "NEEDS_REVIEW", "FAILED"] },
    accepted: {
      type: "object",
      additionalProperties: false,
      properties: {
        entities: { type: "array", items: validationEntitySchema },
        claims: { type: "array", items: validationClaimSchema },
        relationships: { type: "array", items: validationRelationshipSchema },
        events: { type: "array", items: validationEventSchema },
        conflicts: { type: "array", items: validationConflictSchema },
        missingness: { type: "array", items: validationMissingnessSchema },
        derivedClaimCandidates: { type: "array", items: validationDerivedSchema },
      },
      required: [
        "entities",
        "claims",
        "relationships",
        "events",
        "conflicts",
        "missingness",
        "derivedClaimCandidates",
      ],
    },
    rejected: { type: "array", items: validationIssueSchema },
    warnings: { type: "array", items: validationIssueSchema },
    unresolved: { type: "array", items: validationIssueSchema },
    validationErrors: { type: "array", items: validationIssueSchema },
    provenanceErrors: { type: "array", items: validationIssueSchema },
    integrityErrors: { type: "array", items: validationIssueSchema },
  },
  required: [
    "status",
    "accepted",
    "rejected",
    "warnings",
    "unresolved",
    "validationErrors",
    "provenanceErrors",
    "integrityErrors",
  ],
};

export const CASE_INTELLIGENCE_V3_JSON_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: stringLiteral(CASE_INTELLIGENCE_SCHEMA_V3),
    version: { type: "integer", minimum: 1 },
    caseId: nonEmptyString,
    studyRunId: nonEmptyString,
    createdAt: nonEmptyString,
    caseScope: { type: "string", enum: ["single_domain", "multi_domain"] },
    domainId: nonEmptyString,
    domainPackId: nonEmptyString,
    domainPackVersion: nonEmptyString,
    domainSlices: { type: "array", items: domainSliceSchema },
    entities: { type: "array", items: proposedEntitySchema },
    claims: { type: "array", items: validatedClaimSchema },
    events: { type: "array", items: canonicalEventSchema },
    conflicts: { type: "array", items: conflictSchema },
    changes: { type: "array", items: changeSchema },
    unresolved: { type: "array", items: unresolvedItemSchema },
    validationResult: validationResultSchema,
  },
  required: [
    "schemaVersion",
    "version",
    "caseId",
    "studyRunId",
    "createdAt",
    "caseScope",
    "domainId",
    "domainPackId",
    "domainPackVersion",
    "entities",
    "claims",
    "events",
    "conflicts",
    "changes",
    "unresolved",
    "validationResult",
  ],
};
