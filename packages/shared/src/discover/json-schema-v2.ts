/** JSON Schema for OpenAI strict structured outputs (hive-discover-proposal/2). */



const logicalDocumentItem = {

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

      enum: ["recognized", "ambiguous", "unrecognized", "proposed_type"],

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

} as const;



const relationshipItem = {

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

} as const;



const suggestedObjectiveItem = {

  type: "object",

  additionalProperties: false,

  properties: {

    id: { type: "string" },

    label: { type: "string" },

    summary: { type: "string" },

  },

  required: ["id", "label", "summary"],

} as const;



const suggestedAudienceItem = {

  type: "object",

  additionalProperties: false,

  properties: {

    id: { type: "string" },

    label: { type: "string" },

    roleHint: { type: "string" },

  },

  required: ["id", "label", "roleHint"],

} as const;



const domainGroupItem = {

  type: "object",

  additionalProperties: false,

  properties: {

    id: { type: "string" },

    domainId: { type: "string" },

    domainLabel: { type: "string" },

    logicalDocumentIds: {

      type: "array",

      items: { type: "string" },

    },

    description: { type: "string" },

    suggestedObjectives: {

      type: "array",

      minItems: 3,

      maxItems: 5,

      items: suggestedObjectiveItem,

    },

    suggestedAudiences: {

      type: "array",

      items: suggestedAudienceItem,

    },

  },

  required: [

    "id",

    "domainId",

    "domainLabel",

    "logicalDocumentIds",

    "description",

    "suggestedObjectives",

    "suggestedAudiences",

  ],

} as const;



export const HIVE_DISCOVER_PROPOSAL_V2_JSON_SCHEMA = {

  type: "object",

  additionalProperties: false,

  properties: {

    schemaVersion: { type: "string", const: "hive-discover-proposal/2" },

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

    domainGroups: {

      type: "array",

      items: domainGroupItem,

    },

    logicalDocuments: {

      type: "array",

      items: logicalDocumentItem,

    },

    relationships: {

      type: "array",

      items: relationshipItem,

    },

    ambiguityCandidates: {

      type: "array",

      items: {

        type: "object",

        additionalProperties: false,

        properties: {

          id: { type: "string" },

          kind: {

            type: "string",

            enum: [

              "DOCUMENT_IDENTITY",

              "RELATIONSHIP",

              "DOMAIN",

              "CHRONOLOGY",

              "CASE_ENTITY",

            ],

          },

          summary: { type: "string" },

          relatedLogicalDocumentIds: {

            type: "array",

            items: { type: "string" },

          },

          affectsStructure: { type: "boolean" },

        },

        required: [

          "id",

          "kind",

          "summary",

          "relatedLogicalDocumentIds",

          "affectsStructure",

        ],

      },

    },

    clarificationQuestions: {

      type: "array",

      items: {

        type: "object",

        additionalProperties: false,

        properties: {

          id: { type: "string" },

          prompt: { type: "string" },

          humanReason: { type: "string" },

          answerKind: {

            type: "string",

            enum: ["single_choice", "multi_select"],

          },

          options: {

            type: "array",

            items: {

              type: "object",

              additionalProperties: false,

              properties: {

                id: { type: "string" },

                label: { type: "string" },

              },

              required: ["id", "label"],

            },

          },

          ambiguityCandidateId: { type: "string" },

          relatedLogicalDocumentIds: {

            type: "array",

            items: { type: "string" },

          },

        },

        required: [

          "id",

          "prompt",

          "humanReason",

          "answerKind",

          "options",

          "ambiguityCandidateId",

          "relatedLogicalDocumentIds",

        ],

      },

    },

  },

  required: [

    "schemaVersion",

    "domainResolution",

    "domainGroups",

    "logicalDocuments",

    "relationships",

    "ambiguityCandidates",

    "clarificationQuestions",

  ],

} as const;

