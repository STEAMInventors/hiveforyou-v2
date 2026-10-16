import { CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION } from "@hiveforyou/shared/canonical-study-artifact";
import { CANONICAL_STUDY_REPORT_PROJECTION_SCHEMA_VERSION } from "@hiveforyou/shared/canonical-study-report-projection";
import { HIVE_UI_COMPONENT_TYPES, HIVE_UI_PRO_SECTION_KEYS } from "@hiveforyou/shared/hive-ui-tree";
import {
  HIVE_WRITER_CONTRACT_VERSION,
  HIVE_WRITER_IMPLEMENTATION_VERSION,
  HIVE_WRITER_PROPOSAL_SCHEMA_VERSION,
} from "@hiveforyou/shared/hive-writer-proposal";

const claimRefSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    fieldKey: { type: "string" },
    contextId: { type: "string" },
    contextKind: {
      type: "string",
      enum: [
        "provenance_chip",
        "relation",
        "requirement",
        "flag",
        "series_observation",
        "unresolved_item",
        "unresolved_comparison",
      ],
    },
  },
  required: ["fieldKey"],
} as const;

/** Superset props surface; per-component typing is enforced in validate-hive-ui-tree. */
const hiveUiElementPropsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sectionId: { type: "string" },
    claimRef: claimRefSchema,
    relationId: { type: "string" },
    questionIds: { type: "array", items: { type: "string" } },
    evidenceIndex: { type: "integer" },
    seriesId: { type: "string" },
    storySectionIds: { type: "array", items: { type: "string" } },
    sectionKey: { type: "string", enum: [...HIVE_UI_PRO_SECTION_KEYS] },
    fieldKey: { type: "string" },
    viewId: { type: "string" },
    requirementId: { type: "string" },
    flagId: { type: "string" },
    tableIndex: { type: "integer" },
  },
} as const;

const writerUiTreeElementSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    type: { type: "string", enum: [...HIVE_UI_COMPONENT_TYPES] },
    props: hiveUiElementPropsSchema,
    children: { type: "array", items: { type: "string" } },
  },
  required: ["id", "type", "props"],
} as const;

const domainBindingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    domainId: { type: "string" },
    packId: { type: "string" },
    packVersion: { type: "string" },
    packContentSha256: { type: "string" },
    sourceCanonicalSchemaVersion: { type: "string", const: CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION },
    sourceCanonicalArtifactSha256: { type: "string" },
    reportProjectionSchemaVersion: {
      type: "string",
      const: CANONICAL_STUDY_REPORT_PROJECTION_SCHEMA_VERSION,
    },
    reportProjectionContentSha256: { type: "string" },
  },
  required: [
    "domainId",
    "packId",
    "packVersion",
    "packContentSha256",
    "sourceCanonicalSchemaVersion",
    "sourceCanonicalArtifactSha256",
    "reportProjectionSchemaVersion",
    "reportProjectionContentSha256",
  ],
} as const;

const presentationBindingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    audience: { type: "string", enum: ["customer", "pro"] },
    catalogId: { type: "string", const: "hive-canonical-report" },
    catalogVersion: { type: "string", const: "1" },
    uiTreeSchemaVersion: { type: "string", const: "hive-ui-tree/1" },
    writerContractVersion: { type: "string", const: HIVE_WRITER_CONTRACT_VERSION },
  },
  required: [
    "audience",
    "catalogId",
    "catalogVersion",
    "uiTreeSchemaVersion",
    "writerContractVersion",
  ],
} as const;

export const HIVE_WRITER_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: { type: "string", const: HIVE_WRITER_PROPOSAL_SCHEMA_VERSION },
    domainBinding: domainBindingSchema,
    presentationBinding: presentationBindingSchema,
    hiveUiTree: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", const: "hive-ui-tree/1" },
        caseId: { type: "string" },
        studyRunId: { type: "string" },
        audience: { type: "string", enum: ["customer", "pro"] },
        sourceReportArtifactHash: { type: "string" },
        catalogId: { type: "string", const: "hive-canonical-report" },
        catalogVersion: { type: "string", const: "1" },
        narrativeSource: { type: "string", enum: ["deterministic"] },
        root: { type: "string" },
        elements: {
          type: "array",
          items: writerUiTreeElementSchema,
        },
      },
      required: [
        "schemaVersion",
        "caseId",
        "studyRunId",
        "audience",
        "sourceReportArtifactHash",
        "catalogId",
        "catalogVersion",
        "narrativeSource",
        "root",
        "elements",
      ],
    },
    orderingRationale: { type: "string" },
    writerMetadata: {
      type: "object",
      additionalProperties: false,
      properties: {
        writerImplementationVersion: {
          type: "string",
          const: HIVE_WRITER_IMPLEMENTATION_VERSION,
        },
        modelIdentifier: { type: "string" },
      },
      required: ["writerImplementationVersion"],
    },
  },
  required: ["schemaVersion", "domainBinding", "presentationBinding", "hiveUiTree", "writerMetadata"],
} as const;

export const HIVE_WRITER_PROP_SCHEMA_FRAGMENTS = {
  claimRefSchema,
  proSectionKeys: HIVE_UI_PRO_SECTION_KEYS,
  hiveUiElementPropsSchema,
  writerUiTreeElementSchema,
} as const;
