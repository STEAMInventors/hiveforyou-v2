import { z } from "zod";

import type {
  CanonicalStudyReportAudience,
  CanonicalStudyReportClaimRef,
  CanonicalStudyReportNarrativeSource,
} from "./canonical-study-report-projection.js";

export const HIVE_UI_TREE_SCHEMA_VERSION = "hive-ui-tree/1" as const;

export const HIVE_UI_CATALOG_ID = "hive-canonical-report" as const;
export const HIVE_UI_CATALOG_VERSION = "1" as const;

export const HIVE_UI_PRO_SECTION_KEYS = [
  "export",
  "entity_ledger",
  "quotations",
  "relations",
  "operative_views",
  "requirements",
  "flags",
  "measurement_series",
] as const;

export type HiveUiProSectionKey = (typeof HIVE_UI_PRO_SECTION_KEYS)[number];

export const HIVE_UI_LIVING_CASE_CHAPTER_KEYS = [
  "understand",
  "discover",
  "act",
  "verify",
] as const;

export type HiveUiLivingCaseChapterKey = (typeof HIVE_UI_LIVING_CASE_CHAPTER_KEYS)[number];

export const HIVE_UI_COMPONENT_TYPES = [
  "ReportRoot",
  "LivingCaseChapter",
  "ReportHeader",
  "BriefInsights",
  "ExpandableFacts",
  "StorySection",
  "FactRow",
  "ChangePair",
  "ChangesSection",
  "SupportPair",
  "SupportsSection",
  "OpenQuestions",
  "EvidenceChip",
  "MeasurementCard",
  "Timeline",
  "ProSection",
  "ProQuotationRow",
  "ProRelationRow",
  "ProOperativeViewRow",
  "ProRequirementRow",
  "ProFlagRow",
  "ProExportBlock",
] as const;

export type HiveUiComponentType = (typeof HIVE_UI_COMPONENT_TYPES)[number];

export type HiveUiClaimRef = CanonicalStudyReportClaimRef;

const claimRefSchema = z
  .object({
    fieldKey: z.string().min(1),
    contextId: z.string().min(1).optional(),
    contextKind: z
      .enum([
        "provenance_chip",
        "relation",
        "requirement",
        "flag",
        "series_observation",
        "unresolved_item",
        "unresolved_comparison",
      ])
      .optional(),
  })
  .strict();

const proSectionKeySchema = z.enum(HIVE_UI_PRO_SECTION_KEYS);

const livingCaseChapterSchema = z.enum(HIVE_UI_LIVING_CASE_CHAPTER_KEYS);

export const hiveUiComponentPropsSchemas = {
  ReportRoot: z.object({}).strict(),
  LivingCaseChapter: z.object({ chapter: livingCaseChapterSchema }).strict(),
  ReportHeader: z.object({}).strict(),
  BriefInsights: z
    .object({
      claimRefs: z.array(claimRefSchema).min(1).max(8),
    })
    .strict(),
  ExpandableFacts: z
    .object({
      toggleClaimRef: claimRefSchema.optional(),
    })
    .strict(),
  StorySection: z.object({ sectionId: z.string().min(1) }).strict(),
  FactRow: z.object({ claimRef: claimRefSchema }).strict(),
  ChangePair: z.object({ relationId: z.string().min(1) }).strict(),
  ChangesSection: z.object({}).strict(),
  SupportPair: z.object({ relationId: z.string().min(1) }).strict(),
  SupportsSection: z.object({}).strict(),
  OpenQuestions: z.object({ questionIds: z.array(z.string().min(1)) }).strict(),
  EvidenceChip: z
    .object({
      claimRef: claimRefSchema,
      evidenceIndex: z.number().int().min(0).optional(),
    })
    .strict(),
  MeasurementCard: z.object({ seriesId: z.string().min(1) }).strict(),
  Timeline: z.object({ storySectionIds: z.array(z.string().min(1)) }).strict(),
  ProSection: z.object({ sectionKey: proSectionKeySchema }).strict(),
  ProQuotationRow: z.object({ fieldKey: z.string().min(1) }).strict(),
  ProRelationRow: z.object({ relationId: z.string().min(1) }).strict(),
  ProOperativeViewRow: z.object({ viewId: z.string().min(1) }).strict(),
  ProRequirementRow: z.object({ requirementId: z.string().min(1) }).strict(),
  ProFlagRow: z.object({ flagId: z.string().min(1) }).strict(),
  ProExportBlock: z.object({ tableIndex: z.number().int().min(0) }).strict(),
} as const satisfies Record<HiveUiComponentType, z.ZodType>;

export type HiveUiElement = {
  type: HiveUiComponentType;
  props: z.infer<(typeof hiveUiComponentPropsSchemas)[HiveUiComponentType]>;
  children?: string[];
};

export type HiveUiElementMap = Record<string, HiveUiElement>;

export type HiveUiTree = {
  schemaVersion: typeof HIVE_UI_TREE_SCHEMA_VERSION;
  caseId: string;
  studyRunId: string;
  audience: CanonicalStudyReportAudience;
  /** Must match `CanonicalStudyReportProjection.sourceArtifactContentSha256`. */
  sourceReportArtifactHash: string;
  catalogId: typeof HIVE_UI_CATALOG_ID;
  catalogVersion: typeof HIVE_UI_CATALOG_VERSION;
  narrativeSource: CanonicalStudyReportNarrativeSource;
  root: string;
  elements: HiveUiElementMap;
};

export const hiveUiTreeSchema = z
  .object({
    schemaVersion: z.literal(HIVE_UI_TREE_SCHEMA_VERSION),
    caseId: z.string().min(1),
    studyRunId: z.string().min(1),
    audience: z.enum(["customer", "pro"]),
    sourceReportArtifactHash: z.string().length(64),
    catalogId: z.literal(HIVE_UI_CATALOG_ID),
    catalogVersion: z.literal(HIVE_UI_CATALOG_VERSION),
    narrativeSource: z.enum(["deterministic", "writer_validated"]),
    root: z.string().min(1),
    elements: z.record(z.string(), z.unknown()),
  })
  .strict();

export function parseHiveUiTree(value: unknown): HiveUiTree {
  return hiveUiTreeSchema.parse(value) as HiveUiTree;
}
