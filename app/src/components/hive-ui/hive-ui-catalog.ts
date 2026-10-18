import { schema } from "@json-render/react/schema";
import { z } from "zod";

import {
  HIVE_UI_PRO_SECTION_KEYS,
  hiveUiComponentPropsSchemas,
} from "@hiveforyou/shared/hive-ui-tree";

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

export const hiveUiReportCatalog = schema.createCatalog({
  components: {
    ReportRoot: {
      props: hiveUiComponentPropsSchemas.ReportRoot,
      slots: ["default"],
      description: "Root container for a canonical study report UI tree.",
    },
    LivingCaseChapter: {
      props: hiveUiComponentPropsSchemas.LivingCaseChapter,
      slots: ["default"],
      description: "Living Case chapter (understand, discover, act, verify).",
    },
    ReportHeader: {
      props: hiveUiComponentPropsSchemas.ReportHeader,
      slots: [],
      description: "Editorial report header derived from the canonical projection.",
    },
    BriefInsights: {
      props: hiveUiComponentPropsSchemas.BriefInsights,
      slots: [],
      description: "In-brief insight bullets keyed by canonical claim references.",
    },
    ExpandableFacts: {
      props: hiveUiComponentPropsSchemas.ExpandableFacts,
      slots: ["default"],
      description: "Collapsible supporting facts block with child fact rows.",
    },
    StorySection: {
      props: hiveUiComponentPropsSchemas.StorySection,
      slots: ["default"],
      description: "Story section keyed by canonical section id.",
    },
    FactRow: {
      props: hiveUiComponentPropsSchemas.FactRow,
      slots: [],
      description: "Single fact line resolved from a canonical claim reference.",
    },
    ChangePair: {
      props: hiveUiComponentPropsSchemas.ChangePair,
      slots: [],
      description: "Before/after change row keyed by canonical relation id.",
    },
    ChangesSection: {
      props: hiveUiComponentPropsSchemas.ChangesSection,
      slots: ["default"],
      description: "Customer changes section containing change pairs.",
    },
    SupportPair: {
      props: hiveUiComponentPropsSchemas.SupportPair,
      slots: [],
      description: "Support or alignment row keyed by canonical relation id.",
    },
    SupportsSection: {
      props: hiveUiComponentPropsSchemas.SupportsSection,
      slots: ["default"],
      description: "Customer supports section containing support pairs.",
    },
    OpenQuestions: {
      props: hiveUiComponentPropsSchemas.OpenQuestions,
      slots: [],
      description: "Open questions block keyed by canonical question ids.",
    },
    EvidenceChip: {
      props: hiveUiComponentPropsSchemas.EvidenceChip,
      slots: [],
      description: "Evidence chip for a canonical claim reference.",
    },
    MeasurementCard: {
      props: hiveUiComponentPropsSchemas.MeasurementCard,
      slots: [],
      description: "Pro measurement series summary keyed by series id.",
    },
    Timeline: {
      props: hiveUiComponentPropsSchemas.Timeline,
      slots: [],
      description: "Timeline strip ordered by story section ids.",
    },
    ProSection: {
      props: hiveUiComponentPropsSchemas.ProSection,
      slots: ["default"],
      description: `Pro report section (${HIVE_UI_PRO_SECTION_KEYS.join(", ")}).`,
    },
    ProQuotationRow: {
      props: hiveUiComponentPropsSchemas.ProQuotationRow,
      slots: [],
      description: "Pro source quotation keyed by canonical fieldKey.",
    },
    ProRelationRow: {
      props: hiveUiComponentPropsSchemas.ProRelationRow,
      slots: [],
      description: "Pro relationship row keyed by relation id.",
    },
    ProOperativeViewRow: {
      props: hiveUiComponentPropsSchemas.ProOperativeViewRow,
      slots: [],
      description: "Pro operative view keyed by view id.",
    },
    ProRequirementRow: {
      props: hiveUiComponentPropsSchemas.ProRequirementRow,
      slots: [],
      description: "Pro requirement outcome keyed by requirement id.",
    },
    ProFlagRow: {
      props: hiveUiComponentPropsSchemas.ProFlagRow,
      slots: [],
      description: "Pro flag keyed by flag id.",
    },
    ProExportBlock: {
      props: hiveUiComponentPropsSchemas.ProExportBlock,
      slots: [],
      description: "Structured export table keyed by projection table index.",
    },
  },
  actions: {},
});

export { claimRefSchema };
