/** JSON Schema for OpenAI strict resolution outputs (hive-discover-resolution/1). */

export const HIVE_DISCOVER_RESOLUTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: { type: "string", const: "hive-discover-resolution/1" },
    domainResolution: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: {
          type: "string",
          enum: ["SINGLE_DOMAIN", "RESOLVED", "AMBIGUOUS", "MULTI_DOMAIN"],
        },
        domainLabel: { type: "string" },
        candidateDomainLabels: {
          type: ["array", "null"],
          items: { type: "string" },
        },
      },
      required: ["status", "domainLabel", "candidateDomainLabels"],
    },
    logicalDocuments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          domainId: { type: "string" },
          sourceDocumentId: { type: "string" },
          pageStart: { type: "integer", minimum: 1 },
          pageEnd: { type: ["integer", "null"], minimum: 1 },
          documentType: { type: "string" },
          title: { type: "string" },
          documentDate: { type: ["string", "null"] },
          familyRole: { type: "string" },
          groupId: { type: "string" },
          recognitionStatus: {
            type: "string",
            enum: ["recognized", "ambiguous", "unrecognized"],
          },
          sequenceOrder: { type: ["integer", "null"] },
        },
        required: [
          "id",
          "domainId",
          "sourceDocumentId",
          "pageStart",
          "pageEnd",
          "documentType",
          "title",
          "documentDate",
          "familyRole",
          "groupId",
          "recognitionStatus",
          "sequenceOrder",
        ],
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          fromLogicalDocumentId: { type: "string" },
          toLogicalDocumentId: { type: "string" },
          kind: {
            type: "string",
            enum: ["precedes", "supports", "same_sequence", "related"],
          },
          label: { type: ["string", "null"] },
        },
        required: ["id", "fromLogicalDocumentId", "toLogicalDocumentId", "kind", "label"],
      },
    },
    resolvedAmbiguityIds: {
      type: "array",
      items: { type: "string" },
    },
    unresolvedAmbiguityIds: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "schemaVersion",
    "domainResolution",
    "logicalDocuments",
    "relationships",
    "resolvedAmbiguityIds",
    "unresolvedAmbiguityIds",
  ],
} as const;
