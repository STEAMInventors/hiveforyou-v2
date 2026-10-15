import type { CanonicalStudyReportProjection } from "@hiveforyou/shared/canonical-study-report-projection";
import {
  HIVE_UI_CATALOG_ID,
  HIVE_UI_CATALOG_VERSION,
  HIVE_UI_COMPONENT_TYPES,
  HIVE_UI_PRO_SECTION_KEYS,
  HIVE_UI_TREE_SCHEMA_VERSION,
  hiveUiComponentPropsSchemas,
  parseHiveUiTree,
  type HiveUiComponentType,
  type HiveUiElement,
  type HiveUiProSectionKey,
  type HiveUiTree,
} from "@hiveforyou/shared/hive-ui-tree";

import type {
  CanonicalStudyArtifact,
  CanonicalStudyProvenanceChip,
} from "@hiveforyou/shared/canonical-study-artifact";
import type { CanonicalStudyReportClaimRef } from "@hiveforyou/shared/canonical-study-report-projection";

import { indexProvenanceChips } from "./validate-canonical-study-report-projection.js";

function assertClaimRefExists(
  chipIndex: Map<string, CanonicalStudyProvenanceChip>,
  ref: CanonicalStudyReportClaimRef,
): void {
  if (!chipIndex.has(ref.fieldKey)) {
    throw new HiveUiTreeValidationError(`Missing canonical claim for fieldKey ${ref.fieldKey}`);
  }
}

export class HiveUiTreeValidationError extends Error {
  readonly code = "HIVE_UI_TREE_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "HiveUiTreeValidationError";
  }
}

const FORBIDDEN_PROP_KEYS = new Set([
  "displayText",
  "title",
  "detail",
  "quote",
  "message",
  "value",
  "text",
  "label",
  "name",
  "date",
  "measurement",
]);

const CUSTOMER_ONLY: HiveUiComponentType[] = [
  "StorySection",
  "Timeline",
  "ChangePair",
  "ChangesSection",
  "SupportPair",
  "SupportsSection",
  "OpenQuestions",
];

const PRO_ONLY: HiveUiComponentType[] = [
  "MeasurementCard",
  "ProSection",
  "ProQuotationRow",
  "ProRelationRow",
  "ProOperativeViewRow",
  "ProRequirementRow",
  "ProFlagRow",
  "ProExportBlock",
];

const PRO_SECTION_CHILD_TYPES: Record<HiveUiProSectionKey, HiveUiComponentType[]> = {
  export: ["ProExportBlock"],
  entity_ledger: ["FactRow"],
  quotations: ["ProQuotationRow"],
  relations: ["ProRelationRow"],
  operative_views: ["ProOperativeViewRow"],
  requirements: ["ProRequirementRow"],
  flags: ["ProFlagRow"],
  measurement_series: ["MeasurementCard"],
};

const ALLOWED_CHILDREN: Partial<Record<HiveUiComponentType, HiveUiComponentType[]>> = {
  ReportRoot: [
    "StorySection",
    "ChangesSection",
    "SupportsSection",
    "OpenQuestions",
    "Timeline",
    "ProSection",
  ],
  StorySection: ["FactRow", "EvidenceChip"],
  ChangesSection: ["ChangePair"],
  SupportsSection: ["SupportPair"],
  ProSection: [
    "FactRow",
    "ProQuotationRow",
    "ProRelationRow",
    "ProOperativeViewRow",
    "ProRequirementRow",
    "ProFlagRow",
    "ProExportBlock",
    "MeasurementCard",
  ],
};

function assertNoForbiddenProps(rawProps: unknown, elementKey: string): void {
  if (rawProps == null || typeof rawProps !== "object" || Array.isArray(rawProps)) {
    throw new HiveUiTreeValidationError(`Element ${elementKey} props must be an object`);
  }
  for (const key of Object.keys(rawProps)) {
    if (FORBIDDEN_PROP_KEYS.has(key)) {
      throw new HiveUiTreeValidationError(
        `Element ${elementKey} contains forbidden factual prop key "${key}"`,
      );
    }
  }
}

function parseElementProps(
  type: HiveUiComponentType,
  rawProps: unknown,
  elementKey: string,
): HiveUiElement["props"] {
  assertNoForbiddenProps(rawProps, elementKey);
  const schema = hiveUiComponentPropsSchemas[type];
  const parsed = schema.safeParse(rawProps);
  if (!parsed.success) {
    throw new HiveUiTreeValidationError(
      `Element ${elementKey} (${type}) has invalid props: ${parsed.error.message}`,
    );
  }
  return parsed.data as HiveUiElement["props"];
}

function assertAudienceAllowsComponent(
  audience: CanonicalStudyReportProjection["audience"],
  type: HiveUiComponentType,
): void {
  if (audience === "pro" && CUSTOMER_ONLY.includes(type)) {
    throw new HiveUiTreeValidationError(`Component ${type} is not allowed for pro audience`);
  }
  if (audience === "customer" && PRO_ONLY.includes(type)) {
    throw new HiveUiTreeValidationError(`Component ${type} is not allowed for customer audience`);
  }
}

function indexCustomerProjection(
  projection: Extract<CanonicalStudyReportProjection, { audience: "customer" }>,
) {
  const factByFieldKey = new Map<
    string,
    (typeof projection.body.storySections)[number]["facts"][number]
  >();
  const sectionById = new Map(projection.body.storySections.map((section) => [section.id, section]));
  const changeByRelationId = new Map(
    projection.body.changes.map((change) => [change.relationId, change]),
  );
  const supportByRelationId = new Map(
    projection.body.supports.map((row) => [row.relationId, row]),
  );
  const questionById = new Map(
    projection.body.openQuestions.map((question) => [question.id, question]),
  );

  for (const section of projection.body.storySections) {
    for (const fact of section.facts) {
      factByFieldKey.set(fact.claimRef.fieldKey, fact);
    }
  }
  for (const fact of projection.body.importantFacts) {
    factByFieldKey.set(fact.claimRef.fieldKey, fact);
  }
  for (const change of projection.body.changes) {
    factByFieldKey.set(change.left.claimRef.fieldKey, change.left);
    factByFieldKey.set(change.right.claimRef.fieldKey, change.right);
  }
  for (const support of projection.body.supports) {
    factByFieldKey.set(support.left.claimRef.fieldKey, support.left);
    factByFieldKey.set(support.right.claimRef.fieldKey, support.right);
  }

  return {
    factByFieldKey,
    sectionById,
    changeByRelationId,
    supportByRelationId,
    questionById,
  };
}

function indexProProjection(projection: Extract<CanonicalStudyReportProjection, { audience: "pro" }>) {
  const seriesById = new Map(projection.body.measurementSeries.map((row) => [row.id, row]));
  const factByFieldKey = new Map(
    projection.body.entityLedger.map((row) => [row.claimRef.fieldKey, row]),
  );
  const quotationFieldKeys = new Set(
    projection.body.quotations.map((quote) => quote.claimRef.fieldKey),
  );
  const relationById = new Map(projection.body.relations.map((row) => [row.id, row]));
  const operativeViewById = new Map(projection.body.operativeViews.map((row) => [row.id, row]));
  const requirementById = new Map(projection.body.requirements.map((row) => [row.id, row]));
  const flagById = new Map(projection.body.flags.map((row) => [row.id, row]));

  return {
    seriesById,
    factByFieldKey,
    quotationFieldKeys,
    relationById,
    operativeViewById,
    requirementById,
    flagById,
    exportTableCount: projection.body.exportTables.length,
  };
}

function assertFactClaimInProjection(
  projection: CanonicalStudyReportProjection,
  claimRef: { fieldKey: string },
  elementKey: string,
): void {
  if (projection.audience === "customer") {
    const index = indexCustomerProjection(projection);
    if (!index.factByFieldKey.has(claimRef.fieldKey)) {
      throw new HiveUiTreeValidationError(
        `Element ${elementKey} references unknown claim fieldKey ${claimRef.fieldKey}`,
      );
    }
    return;
  }
  const index = indexProProjection(projection);
  if (!index.factByFieldKey.has(claimRef.fieldKey)) {
    throw new HiveUiTreeValidationError(
      `Element ${elementKey} references unknown claim fieldKey ${claimRef.fieldKey}`,
    );
  }
}

function assertEvidenceForFactRow(
  projection: CanonicalStudyReportProjection,
  claimRef: { fieldKey: string },
  elementKey: string,
): void {
  if (projection.audience !== "customer") {
    return;
  }
  const index = indexCustomerProjection(projection);
  const fact = index.factByFieldKey.get(claimRef.fieldKey);
  if (!fact || fact.evidence.length === 0) {
    throw new HiveUiTreeValidationError(
      `Element ${elementKey} references claim ${claimRef.fieldKey} without evidence`,
    );
  }
}

function assertNotClassifiedEvidenceChip(
  projection: CanonicalStudyReportProjection,
  claimRef: { fieldKey: string },
  elementKey: string,
): void {
  if (projection.audience !== "customer") {
    return;
  }
  const index = indexCustomerProjection(projection);
  const fact = index.factByFieldKey.get(claimRef.fieldKey);
  if (fact?.assertionKind === "classified") {
    throw new HiveUiTreeValidationError(
      `Element ${elementKey} must not present classified claim ${claimRef.fieldKey} as verified evidence`,
    );
  }
}

function assertVerifiedQuotationField(
  projection: Extract<CanonicalStudyReportProjection, { audience: "pro" }>,
  fieldKey: string,
  elementKey: string,
): void {
  const index = indexProProjection(projection);
  if (!index.quotationFieldKeys.has(fieldKey)) {
    throw new HiveUiTreeValidationError(
      `Element ${elementKey} references unknown quotation fieldKey ${fieldKey}`,
    );
  }
  const ledgerRow = index.factByFieldKey.get(fieldKey);
  if (!ledgerRow || ledgerRow.assertionKind !== "verified_quoted") {
    throw new HiveUiTreeValidationError(
      `Element ${elementKey} must not present non-verified field ${fieldKey} as a source quotation`,
    );
  }
}

function validateElementSemantics(
  projection: CanonicalStudyReportProjection,
  elementKey: string,
  element: HiveUiElement,
  chipIndex: Map<string, CanonicalStudyProvenanceChip>,
): void {
  switch (element.type) {
    case "FactRow": {
      const props = element.props as { claimRef: { fieldKey: string } };
      assertClaimRefExists(chipIndex, props.claimRef);
      assertFactClaimInProjection(projection, props.claimRef, elementKey);
      assertEvidenceForFactRow(projection, props.claimRef, elementKey);
      break;
    }
    case "EvidenceChip": {
      const props = element.props as {
        claimRef: { fieldKey: string };
        evidenceIndex?: number;
      };
      assertClaimRefExists(chipIndex, props.claimRef);
      assertFactClaimInProjection(projection, props.claimRef, elementKey);
      assertNotClassifiedEvidenceChip(projection, props.claimRef, elementKey);
      if (projection.audience === "customer") {
        const index = indexCustomerProjection(projection);
        const fact = index.factByFieldKey.get(props.claimRef.fieldKey);
        const evidenceIndex = props.evidenceIndex ?? 0;
        if (!fact?.evidence[evidenceIndex]) {
          throw new HiveUiTreeValidationError(
            `Element ${elementKey} references missing evidence index ${evidenceIndex}`,
          );
        }
      }
      break;
    }
    case "StorySection": {
      if (projection.audience !== "customer") {
        throw new HiveUiTreeValidationError(`StorySection requires customer projection`);
      }
      const props = element.props as { sectionId: string };
      if (props.sectionId === "__important_facts__") {
        break;
      }
      const index = indexCustomerProjection(projection);
      if (!index.sectionById.has(props.sectionId)) {
        throw new HiveUiTreeValidationError(
          `Element ${elementKey} references unknown story section ${props.sectionId}`,
        );
      }
      break;
    }
    case "ChangePair": {
      if (projection.audience !== "customer") {
        throw new HiveUiTreeValidationError(`ChangePair requires customer projection`);
      }
      const props = element.props as { relationId: string };
      const index = indexCustomerProjection(projection);
      if (!index.changeByRelationId.has(props.relationId)) {
        throw new HiveUiTreeValidationError(
          `Element ${elementKey} references unknown change relation ${props.relationId}`,
        );
      }
      break;
    }
    case "ChangesSection":
    case "SupportsSection": {
      if (projection.audience !== "customer") {
        throw new HiveUiTreeValidationError(`${element.type} requires customer projection`);
      }
      break;
    }
    case "SupportPair": {
      if (projection.audience !== "customer") {
        throw new HiveUiTreeValidationError(`SupportPair requires customer projection`);
      }
      const props = element.props as { relationId: string };
      const index = indexCustomerProjection(projection);
      if (!index.supportByRelationId.has(props.relationId)) {
        throw new HiveUiTreeValidationError(
          `Element ${elementKey} references unknown support relation ${props.relationId}`,
        );
      }
      break;
    }
    case "OpenQuestions": {
      if (projection.audience !== "customer") {
        throw new HiveUiTreeValidationError(`OpenQuestions requires customer projection`);
      }
      const props = element.props as { questionIds: string[] };
      const index = indexCustomerProjection(projection);
      for (const questionId of props.questionIds) {
        if (!index.questionById.has(questionId)) {
          throw new HiveUiTreeValidationError(
            `Element ${elementKey} references unknown open question ${questionId}`,
          );
        }
      }
      break;
    }
    case "Timeline": {
      if (projection.audience !== "customer") {
        throw new HiveUiTreeValidationError(`Timeline requires customer projection`);
      }
      const props = element.props as { storySectionIds: string[] };
      const index = indexCustomerProjection(projection);
      for (const sectionId of props.storySectionIds) {
        if (!index.sectionById.has(sectionId)) {
          throw new HiveUiTreeValidationError(
            `Element ${elementKey} references unknown timeline section ${sectionId}`,
          );
        }
      }
      break;
    }
    case "MeasurementCard": {
      if (projection.audience !== "pro") {
        throw new HiveUiTreeValidationError(`MeasurementCard requires pro projection`);
      }
      const props = element.props as { seriesId: string };
      const index = indexProProjection(projection);
      if (!index.seriesById.has(props.seriesId)) {
        throw new HiveUiTreeValidationError(
          `Element ${elementKey} references unknown measurement series ${props.seriesId}`,
        );
      }
      break;
    }
    case "ProSection": {
      if (projection.audience !== "pro") {
        throw new HiveUiTreeValidationError(`ProSection requires pro projection`);
      }
      const props = element.props as { sectionKey: HiveUiProSectionKey };
      if (!HIVE_UI_PRO_SECTION_KEYS.includes(props.sectionKey)) {
        throw new HiveUiTreeValidationError(
          `Element ${elementKey} references unknown pro section ${props.sectionKey}`,
        );
      }
      break;
    }
    case "ProQuotationRow": {
      if (projection.audience !== "pro") {
        throw new HiveUiTreeValidationError(`ProQuotationRow requires pro projection`);
      }
      const props = element.props as { fieldKey: string };
      assertClaimRefExists(chipIndex, { fieldKey: props.fieldKey });
      assertVerifiedQuotationField(projection, props.fieldKey, elementKey);
      break;
    }
    case "ProRelationRow": {
      if (projection.audience !== "pro") {
        throw new HiveUiTreeValidationError(`ProRelationRow requires pro projection`);
      }
      const props = element.props as { relationId: string };
      const index = indexProProjection(projection);
      if (!index.relationById.has(props.relationId)) {
        throw new HiveUiTreeValidationError(
          `Element ${elementKey} references unknown relation ${props.relationId}`,
        );
      }
      break;
    }
    case "ProOperativeViewRow": {
      if (projection.audience !== "pro") {
        throw new HiveUiTreeValidationError(`ProOperativeViewRow requires pro projection`);
      }
      const props = element.props as { viewId: string };
      const index = indexProProjection(projection);
      if (!index.operativeViewById.has(props.viewId)) {
        throw new HiveUiTreeValidationError(
          `Element ${elementKey} references unknown operative view ${props.viewId}`,
        );
      }
      break;
    }
    case "ProRequirementRow": {
      if (projection.audience !== "pro") {
        throw new HiveUiTreeValidationError(`ProRequirementRow requires pro projection`);
      }
      const props = element.props as { requirementId: string };
      const index = indexProProjection(projection);
      if (!index.requirementById.has(props.requirementId)) {
        throw new HiveUiTreeValidationError(
          `Element ${elementKey} references unknown requirement ${props.requirementId}`,
        );
      }
      break;
    }
    case "ProFlagRow": {
      if (projection.audience !== "pro") {
        throw new HiveUiTreeValidationError(`ProFlagRow requires pro projection`);
      }
      const props = element.props as { flagId: string };
      const index = indexProProjection(projection);
      if (!index.flagById.has(props.flagId)) {
        throw new HiveUiTreeValidationError(
          `Element ${elementKey} references unknown flag ${props.flagId}`,
        );
      }
      break;
    }
    case "ProExportBlock": {
      if (projection.audience !== "pro") {
        throw new HiveUiTreeValidationError(`ProExportBlock requires pro projection`);
      }
      const props = element.props as { tableIndex: number };
      const index = indexProProjection(projection);
      if (props.tableIndex < 0 || props.tableIndex >= index.exportTableCount) {
        throw new HiveUiTreeValidationError(
          `Element ${elementKey} references unknown export table index ${props.tableIndex}`,
        );
      }
      break;
    }
    case "ReportRoot":
      break;
    default:
      throw new HiveUiTreeValidationError(`Unsupported component type ${String(element.type)}`);
  }
}

function assertPublicationAllowsTree(
  projection: CanonicalStudyReportProjection,
  tree: HiveUiTree,
): void {
  if (tree.schemaVersion !== HIVE_UI_TREE_SCHEMA_VERSION) {
    throw new HiveUiTreeValidationError(`Unsupported schemaVersion ${tree.schemaVersion}`);
  }
  if (tree.catalogId !== HIVE_UI_CATALOG_ID || tree.catalogVersion !== HIVE_UI_CATALOG_VERSION) {
    throw new HiveUiTreeValidationError("Catalog id/version mismatch");
  }
  if (tree.caseId !== projection.caseId || tree.studyRunId !== projection.studyRunId) {
    throw new HiveUiTreeValidationError("Tree caseId/studyRunId mismatch projection");
  }
  if (tree.audience !== projection.audience) {
    throw new HiveUiTreeValidationError("Tree audience mismatch projection");
  }
  if (tree.sourceReportArtifactHash !== projection.sourceArtifactContentSha256) {
    throw new HiveUiTreeValidationError("Source report artifact hash mismatch");
  }
  if (projection.presentationMode === "approved" && !projection.customerProReportsPermitted) {
    throw new HiveUiTreeValidationError(
      "Approved presentation requires customerProReportsPermitted",
    );
  }
  if (
    tree.narrativeSource === "writer_validated" &&
    projection.narrativeSource !== "writer_validated"
  ) {
    throw new HiveUiTreeValidationError(
      "Writer-validated tree requires writer-validated projection",
    );
  }
}

function assertProSectionChildAllowed(
  sectionKey: HiveUiProSectionKey,
  childType: HiveUiComponentType,
  parentKey: string,
  childKey: string,
): void {
  const allowed = PRO_SECTION_CHILD_TYPES[sectionKey];
  if (!allowed.includes(childType)) {
    throw new HiveUiTreeValidationError(
      `Element ${parentKey} (${sectionKey}) cannot nest child ${childKey} type ${childType}`,
    );
  }
}

export function assertHiveUiTree(
  artifact: CanonicalStudyArtifact,
  projection: CanonicalStudyReportProjection,
  rawTree: unknown,
): HiveUiTree {
  const parsed = parseHiveUiTree(rawTree);
  assertPublicationAllowsTree(projection, parsed);

  const chipIndex = indexProvenanceChips(artifact);
  const allowedTypes = new Set<string>(HIVE_UI_COMPONENT_TYPES);

  const root = parsed.elements[parsed.root];
  if (!root || root.type !== "ReportRoot") {
    throw new HiveUiTreeValidationError("Root element must be ReportRoot");
  }

  const seen = new Set<string>();

  for (const [elementKey, rawElement] of Object.entries(parsed.elements)) {
    if (rawElement == null || typeof rawElement !== "object" || Array.isArray(rawElement)) {
      throw new HiveUiTreeValidationError(`Element ${elementKey} must be an object`);
    }
    const type = (rawElement as HiveUiElement).type;
    if (!allowedTypes.has(type)) {
      throw new HiveUiTreeValidationError(`Unsupported component type ${String(type)}`);
    }
    assertAudienceAllowsComponent(projection.audience, type as HiveUiComponentType);

    const props = parseElementProps(
      type as HiveUiComponentType,
      (rawElement as HiveUiElement).props,
      elementKey,
    );
    const children = (rawElement as HiveUiElement).children ?? [];
    if (!Array.isArray(children) || children.some((child) => typeof child !== "string")) {
      throw new HiveUiTreeValidationError(`Element ${elementKey} children must be string keys`);
    }

    const element: HiveUiElement = { type: type as HiveUiComponentType, props, children };
    validateElementSemantics(projection, elementKey, element, chipIndex);

    const allowedChildTypes = ALLOWED_CHILDREN[type as HiveUiComponentType];
    if (allowedChildTypes) {
      for (const childKey of children) {
        const child = parsed.elements[childKey];
        if (!child) {
          throw new HiveUiTreeValidationError(
            `Element ${elementKey} references missing child ${childKey}`,
          );
        }
        if (!allowedChildTypes.includes(child.type as HiveUiComponentType)) {
          throw new HiveUiTreeValidationError(
            `Element ${elementKey} cannot nest child type ${child.type}`,
          );
        }
        if (element.type === "ProSection") {
          const sectionKey = (element.props as { sectionKey: HiveUiProSectionKey }).sectionKey;
          assertProSectionChildAllowed(
            sectionKey,
            child.type as HiveUiComponentType,
            elementKey,
            childKey,
          );
        }
      }
    }

    seen.add(elementKey);
  }

  if (!seen.has(parsed.root)) {
    throw new HiveUiTreeValidationError("Root key missing from elements map");
  }

  return parsed;
}

export function tryAssertHiveUiTree(
  artifact: CanonicalStudyArtifact,
  projection: CanonicalStudyReportProjection,
  rawTree: unknown,
): HiveUiTree | null {
  try {
    return assertHiveUiTree(artifact, projection, rawTree);
  } catch {
    return null;
  }
}
