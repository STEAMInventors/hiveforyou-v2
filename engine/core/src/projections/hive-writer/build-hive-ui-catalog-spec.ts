import { HIVE_UI_COMPONENT_TYPES, type HiveUiComponentType } from "@hiveforyou/shared/hive-ui-tree";

export type HiveUiCatalogComponentSpec = {
  type: HiveUiComponentType;
  allowedPropKeys: string[];
};

const PROP_KEYS_BY_TYPE: Record<HiveUiComponentType, string[]> = {
  ReportRoot: [],
  StorySection: ["sectionId"],
  FactRow: ["claimRef"],
  ChangePair: ["relationId"],
  ChangesSection: [],
  SupportPair: ["relationId"],
  SupportsSection: [],
  OpenQuestions: ["questionIds"],
  EvidenceChip: ["claimRef", "evidenceIndex"],
  MeasurementCard: ["seriesId"],
  Timeline: ["storySectionIds"],
  ProSection: ["sectionKey"],
  ProQuotationRow: ["fieldKey"],
  ProRelationRow: ["relationId"],
  ProOperativeViewRow: ["viewId"],
  ProRequirementRow: ["requirementId"],
  ProFlagRow: ["flagId"],
  ProExportBlock: ["tableIndex"],
};

export function buildHiveUiCatalogSpec(): HiveUiCatalogComponentSpec[] {
  return HIVE_UI_COMPONENT_TYPES.map((type) => ({
    type,
    allowedPropKeys: [...PROP_KEYS_BY_TYPE[type]],
  }));
}
