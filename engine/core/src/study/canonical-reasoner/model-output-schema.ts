import type { ModelJsonSchemaFormat } from "@hiveforyou/shared/model/call-model";

/**
 * Model-facing strict schema: graph body only. Hive Core injects schemaVersion, pins, and modelPin.
 */
export const CANONICAL_REASONER_MODEL_OUTPUT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    observables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1 },
          typeId: { type: "string", minLength: 1 },
          label: { type: "string", minLength: 1 },
          aliases: { type: "array", items: { type: "string", minLength: 1 } },
          externalIds: { type: "array", items: { type: "string", minLength: 1 } },
          identityStatus: {
            type: "string",
            enum: ["resolved", "provisional", "unresolved"],
          },
          observationIds: { type: "array", items: { type: "string", minLength: 1 } },
          resolutionIds: { type: "array", items: { type: "string", minLength: 1 } },
        },
        required: ["id", "typeId", "label", "identityStatus", "observationIds"],
      },
    },
    observationLinks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          observationId: { type: "string", minLength: 1 },
          observableId: { type: "string", minLength: 1 },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["observationId", "observableId"],
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1 },
          relationshipTypeId: { type: "string", minLength: 1 },
          fromObservableId: { type: "string", minLength: 1 },
          toObservableId: { type: "string", minLength: 1 },
          supportingObservationIds: { type: "array", items: { type: "string", minLength: 1 } },
          reasoningSummary: { type: "string", minLength: 1 },
        },
        required: [
          "id",
          "relationshipTypeId",
          "fromObservableId",
          "toObservableId",
          "supportingObservationIds",
        ],
      },
    },
    resolutions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1 },
          resolutionTypeId: { type: "string", minLength: 1 },
          observationIds: { type: "array", items: { type: "string", minLength: 1 } },
          observableIds: { type: "array", items: { type: "string", minLength: 1 } },
          decision: { type: "string", minLength: 1 },
          supportingObservationIds: { type: "array", items: { type: "string", minLength: 1 } },
          reasoningSummary: { type: "string", minLength: 1 },
        },
        required: [
          "id",
          "resolutionTypeId",
          "observationIds",
          "observableIds",
          "decision",
          "supportingObservationIds",
        ],
      },
    },
    candidateConflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1 },
          observationIds: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
          },
          subjectDescription: { type: "string", minLength: 1 },
          nature: { type: "string", minLength: 1 },
          temporalScope: {
            type: "object",
            additionalProperties: false,
            properties: {
              start: { type: "string", minLength: 1 },
              end: { type: "string", minLength: 1 },
              precision: { type: "string", enum: ["day", "month", "year", "unknown"] },
            },
            required: [],
          },
          supportingObservationIds: { type: "array", items: { type: "string", minLength: 1 } },
        },
        required: ["id", "observationIds", "nature", "supportingObservationIds"],
      },
    },
    candidateFindings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1 },
          kind: { type: "string", enum: ["presence", "absence"] },
          description: { type: "string", minLength: 1 },
          supportingObservationIds: { type: "array", items: { type: "string", minLength: 1 } },
          supportingResolutionIds: { type: "array", items: { type: "string", minLength: 1 } },
          absenceScope: {
            type: "object",
            additionalProperties: false,
            properties: {
              documentCoverageEstablished: { type: "boolean" },
              searchScopeDeclared: { type: "boolean" },
              searchScope: {
                type: "object",
                additionalProperties: false,
                properties: {
                  observableTypeIds: { type: "array", items: { type: "string", minLength: 1 } },
                  relationshipTypeIds: { type: "array", items: { type: "string", minLength: 1 } },
                  documentScopeIds: { type: "array", items: { type: "string", minLength: 1 } },
                },
                required: ["observableTypeIds", "relationshipTypeIds", "documentScopeIds"],
              },
            },
            required: ["documentCoverageEstablished", "searchScopeDeclared", "searchScope"],
          },
        },
        required: ["id", "kind", "description", "supportingObservationIds"],
      },
    },
    unresolved: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1 },
          kind: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 1 },
          relatedObservationIds: { type: "array", items: { type: "string", minLength: 1 } },
          relatedObservableIds: { type: "array", items: { type: "string", minLength: 1 } },
        },
        required: ["id", "kind", "description"],
      },
    },
  },
  required: [
    "observables",
    "observationLinks",
    "relationships",
    "resolutions",
    "candidateConflicts",
    "candidateFindings",
    "unresolved",
  ],
};

export const CANONICAL_REASONER_MODEL_TEXT_FORMAT: ModelJsonSchemaFormat = {
  type: "json_schema",
  name: "canonical_study_reasoner_graph_body_v1",
  strict: true,
  schema: CANONICAL_REASONER_MODEL_OUTPUT_JSON_SCHEMA,
};
