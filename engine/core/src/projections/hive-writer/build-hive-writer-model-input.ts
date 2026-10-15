import type { CanonicalStudyReportProjection } from "@hiveforyou/shared/canonical-study-report-projection";
import {
  HIVE_UI_CATALOG_ID,
  HIVE_UI_CATALOG_VERSION,
  HIVE_UI_TREE_SCHEMA_VERSION,
} from "@hiveforyou/shared/hive-ui-tree";
import {
  type HiveWriterDomainBinding,
  type HiveWriterModelInput,
  type HiveWriterPresentationBinding,
  type HiveWriterPublicationRestrictions,
  HIVE_WRITER_CONTRACT_VERSION,
  HIVE_WRITER_INPUT_SCHEMA_VERSION,
} from "@hiveforyou/shared/hive-writer-proposal";

import { buildHiveUiCatalogSpec } from "./build-hive-ui-catalog-spec.js";

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function indexCustomerProjection(
  projection: Extract<CanonicalStudyReportProjection, { audience: "customer" }>,
): HiveWriterModelInput["reportIdIndex"] {
  const factFieldKeys: string[] = [];
  for (const section of projection.body.storySections) {
    for (const fact of section.facts) {
      factFieldKeys.push(fact.claimRef.fieldKey);
    }
  }
  for (const fact of projection.body.importantFacts) {
    factFieldKeys.push(fact.claimRef.fieldKey);
  }
  return {
    storySectionIds: projection.body.storySections.map((section) => section.id),
    factFieldKeys: uniqueStrings(factFieldKeys),
    changeRelationIds: projection.body.changes.map((row) => row.relationId),
    supportRelationIds: projection.body.supports.map((row) => row.relationId),
    openQuestionIds: projection.body.openQuestions.map((question) => question.id),
  };
}

function indexProProjection(
  projection: Extract<CanonicalStudyReportProjection, { audience: "pro" }>,
): HiveWriterModelInput["reportIdIndex"] {
  const factFieldKeys = projection.body.entityLedger.map((row) => row.claimRef.fieldKey);
  return {
    storySectionIds: [],
    factFieldKeys: uniqueStrings(factFieldKeys),
    changeRelationIds: [],
    supportRelationIds: [],
    openQuestionIds: [],
    quotationFieldKeys: uniqueStrings(projection.body.quotations.map((row) => row.claimRef.fieldKey)),
    relationIds: projection.body.relations.map((row) => row.id),
    operativeViewIds: projection.body.operativeViews.map((row) => row.id),
    requirementIds: projection.body.requirements.map((row) => row.id),
    flagIds: projection.body.flags.map((row) => row.id),
    measurementSeriesIds: projection.body.measurementSeries.map((row) => row.id),
    exportTableIndices: projection.body.exportTables.map((_table, index) => index),
  };
}

export function buildHiveWriterPresentationBinding(
  projection: CanonicalStudyReportProjection,
): HiveWriterPresentationBinding {
  return {
    audience: projection.audience,
    catalogId: HIVE_UI_CATALOG_ID,
    catalogVersion: HIVE_UI_CATALOG_VERSION,
    uiTreeSchemaVersion: HIVE_UI_TREE_SCHEMA_VERSION,
    writerContractVersion: HIVE_WRITER_CONTRACT_VERSION,
  };
}

export function buildHiveWriterModelInput(input: {
  projection: CanonicalStudyReportProjection;
  domainBinding: HiveWriterDomainBinding;
  publicationRestrictions: HiveWriterPublicationRestrictions;
  presentationInstructions?: string | null;
}): HiveWriterModelInput {
  const { projection, domainBinding, publicationRestrictions } = input;
  const reportIdIndex =
    projection.audience === "customer"
      ? indexCustomerProjection(projection)
      : indexProProjection(projection);

  const sectionOrderingHints =
    projection.audience === "customer"
      ? projection.body.storySections.map((section) => ({
          sectionId: section.id,
          sortRank: section.sortRank,
        }))
      : undefined;

  const presentationInstructions = input.presentationInstructions?.trim();
  return {
    schemaVersion: HIVE_WRITER_INPUT_SCHEMA_VERSION,
    caseId: projection.caseId,
    studyRunId: projection.studyRunId,
    domainBinding,
    presentationBinding: buildHiveWriterPresentationBinding(projection),
    catalogComponents: buildHiveUiCatalogSpec(),
    reportIdIndex,
    sectionOrderingHints,
    publicationRestrictions,
    presentationInstructions:
      presentationInstructions && presentationInstructions.length > 0
        ? presentationInstructions.slice(0, 4000)
        : undefined,
  };
}
