import { z } from "zod";

import { CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION } from "./canonical-study-artifact.js";
import {
  CANONICAL_STUDY_REPORT_PROJECTION_SCHEMA_VERSION,
  type CanonicalStudyReportAudience,
  type CanonicalStudyReportPresentationMode,
} from "./canonical-study-report-projection.js";
import {
  HIVE_UI_CATALOG_ID,
  HIVE_UI_CATALOG_VERSION,
  HIVE_UI_COMPONENT_TYPES,
  HIVE_UI_TREE_SCHEMA_VERSION,
  hiveUiTreeSchema,
} from "./hive-ui-tree.js";

export const HIVE_WRITER_INPUT_SCHEMA_VERSION = "hive-writer-input/1" as const;
export const HIVE_WRITER_PROPOSAL_SCHEMA_VERSION = "hive-writer-proposal/1" as const;

/** Code-pinned Writer contract (prompt + validation surface). */
export const HIVE_WRITER_CONTRACT_VERSION = "1" as const;

/** Code-pinned Writer implementation version (idempotency + observability). */
export const HIVE_WRITER_IMPLEMENTATION_VERSION = "1" as const;

export const HIVE_WRITER_SHADOW_RECORD_SCHEMA_VERSION = "hive-writer-shadow-record/1" as const;

export type HiveWriterShadowStatus = "accepted" | "rejected" | "failed" | "skipped" | "unavailable";

const sha256HexSchema = z.string().length(64).regex(/^[a-f0-9]{64}$/);

export const hiveWriterDomainBindingSchema = z
  .object({
    domainId: z.string().min(1),
    packId: z.string().min(1),
    packVersion: z.string().min(1),
    packContentSha256: sha256HexSchema,
    sourceCanonicalSchemaVersion: z.literal(CANONICAL_STUDY_ARTIFACT_SCHEMA_VERSION),
    sourceCanonicalArtifactSha256: sha256HexSchema,
    reportProjectionSchemaVersion: z.literal(CANONICAL_STUDY_REPORT_PROJECTION_SCHEMA_VERSION),
    reportProjectionContentSha256: sha256HexSchema,
  })
  .strict();

export type HiveWriterDomainBinding = z.infer<typeof hiveWriterDomainBindingSchema>;

export const hiveWriterPresentationBindingSchema = z
  .object({
    audience: z.enum(["customer", "pro"]),
    catalogId: z.literal(HIVE_UI_CATALOG_ID),
    catalogVersion: z.literal(HIVE_UI_CATALOG_VERSION),
    uiTreeSchemaVersion: z.literal(HIVE_UI_TREE_SCHEMA_VERSION),
    writerContractVersion: z.literal(HIVE_WRITER_CONTRACT_VERSION),
  })
  .strict();

export type HiveWriterPresentationBinding = z.infer<typeof hiveWriterPresentationBindingSchema>;

const catalogComponentSpecSchema = z
  .object({
    type: z.enum(HIVE_UI_COMPONENT_TYPES),
    allowedPropKeys: z.array(z.string().min(1)),
  })
  .strict();

const reportIdIndexSchema = z
  .object({
    storySectionIds: z.array(z.string().min(1)),
    factFieldKeys: z.array(z.string().min(1)),
    changeRelationIds: z.array(z.string().min(1)),
    supportRelationIds: z.array(z.string().min(1)),
    openQuestionIds: z.array(z.string().min(1)),
    quotationFieldKeys: z.array(z.string().min(1)).optional(),
    relationIds: z.array(z.string().min(1)).optional(),
    operativeViewIds: z.array(z.string().min(1)).optional(),
    requirementIds: z.array(z.string().min(1)).optional(),
    flagIds: z.array(z.string().min(1)).optional(),
    measurementSeriesIds: z.array(z.string().min(1)).optional(),
    exportTableIndices: z.array(z.number().int().min(0)).optional(),
  })
  .strict();

const publicationRestrictionsSchema = z
  .object({
    presentationMode: z.enum(["approved", "internal_preview"]),
    customerProReportsPermitted: z.boolean(),
  })
  .strict();

export const hiveWriterModelInputSchema = z
  .object({
    schemaVersion: z.literal(HIVE_WRITER_INPUT_SCHEMA_VERSION),
    caseId: z.string().min(1),
    studyRunId: z.string().min(1),
    domainBinding: hiveWriterDomainBindingSchema,
    presentationBinding: hiveWriterPresentationBindingSchema,
    catalogComponents: z.array(catalogComponentSpecSchema).min(1),
    reportIdIndex: reportIdIndexSchema,
    sectionOrderingHints: z
      .array(
        z
          .object({
            sectionId: z.string().min(1),
            sortRank: z.number(),
          })
          .strict(),
      )
      .optional(),
    publicationRestrictions: publicationRestrictionsSchema,
    presentationInstructions: z.string().max(4000).optional(),
  })
  .strict();

export type HiveWriterModelInput = z.infer<typeof hiveWriterModelInputSchema>;

export const hiveWriterProposalSchema = z
  .object({
    schemaVersion: z.literal(HIVE_WRITER_PROPOSAL_SCHEMA_VERSION),
    domainBinding: hiveWriterDomainBindingSchema,
    presentationBinding: hiveWriterPresentationBindingSchema,
    hiveUiTree: hiveUiTreeSchema,
    orderingRationale: z.string().max(2000).optional(),
    writerMetadata: z
      .object({
        writerImplementationVersion: z.literal(HIVE_WRITER_IMPLEMENTATION_VERSION),
        modelIdentifier: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

export type HiveWriterProposal = z.infer<typeof hiveWriterProposalSchema>;

export type HiveWriterModelUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheReadInputTokens?: number | null;
  cacheWriteInputTokens?: number | null;
};

export type HiveWriterShadowObservability = {
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  projectionHash: string;
  catalogVersion: typeof HIVE_UI_CATALOG_VERSION;
  writerImplementationVersion: typeof HIVE_WRITER_IMPLEMENTATION_VERSION;
  proposalSchemaVersion: typeof HIVE_WRITER_PROPOSAL_SCHEMA_VERSION;
  modelIdentifier: string | null;
  durationMs: number;
  tokenUsage: HiveWriterModelUsage | null;
};

export type HiveWriterShadowValidationResult = {
  ok: boolean;
  errorCodes: string[];
  message: string | null;
};

export type HiveWriterShadowRecord = {
  schemaVersion: typeof HIVE_WRITER_SHADOW_RECORD_SCHEMA_VERSION;
  idempotencyKey: string;
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  status: HiveWriterShadowStatus;
  observability: HiveWriterShadowObservability;
  validation: HiveWriterShadowValidationResult;
  proposal: HiveWriterProposal | null;
  /** Validated tree when status is accepted; null otherwise. */
  hiveUiTree: z.infer<typeof hiveUiTreeSchema> | null;
};

export function parseHiveWriterProposal(value: unknown): HiveWriterProposal {
  return hiveWriterProposalSchema.parse(value);
}

export function parseHiveWriterModelInput(value: unknown): HiveWriterModelInput {
  return hiveWriterModelInputSchema.parse(value);
}

export function parseHiveWriterShadowRecord(value: unknown): HiveWriterShadowRecord {
  const base = z
    .object({
      schemaVersion: z.literal(HIVE_WRITER_SHADOW_RECORD_SCHEMA_VERSION),
      idempotencyKey: z.string().length(64),
      caseId: z.string().min(1),
      studyRunId: z.string().min(1),
      audience: z.enum(["customer", "pro"]),
      status: z.enum(["accepted", "rejected", "failed", "skipped", "unavailable"]),
      observability: z.object({
        studyRunId: z.string().min(1),
        audience: z.enum(["customer", "pro"]),
        projectionHash: z.string().length(64),
        catalogVersion: z.literal(HIVE_UI_CATALOG_VERSION),
        writerImplementationVersion: z.literal(HIVE_WRITER_IMPLEMENTATION_VERSION),
        proposalSchemaVersion: z.literal(HIVE_WRITER_PROPOSAL_SCHEMA_VERSION),
        modelIdentifier: z.string().nullable(),
        durationMs: z.number().nonnegative(),
        tokenUsage: z
          .object({
            inputTokens: z.number().nullable().optional(),
            outputTokens: z.number().nullable().optional(),
            cacheReadInputTokens: z.number().nullable().optional(),
            cacheWriteInputTokens: z.number().nullable().optional(),
          })
          .nullable(),
      }),
      validation: z.object({
        ok: z.boolean(),
        errorCodes: z.array(z.string()),
        message: z.string().nullable(),
      }),
      proposal: hiveWriterProposalSchema.nullable(),
      hiveUiTree: hiveUiTreeSchema.nullable(),
    })
    .strict();
  return base.parse(value) as HiveWriterShadowRecord;
}

/** Envelope constants echoed in every Writer-produced UI tree. */
export const HIVE_WRITER_UI_TREE_ENVELOPE = {
  schemaVersion: HIVE_UI_TREE_SCHEMA_VERSION,
  catalogId: HIVE_UI_CATALOG_ID,
  catalogVersion: HIVE_UI_CATALOG_VERSION,
  narrativeSource: "deterministic" as const,
};

export type HiveWriterPublicationRestrictions = {
  presentationMode: CanonicalStudyReportPresentationMode;
  customerProReportsPermitted: boolean;
};
