import type { CanonicalStudyReportProjection } from "@hiveforyou/shared/canonical-study-report-projection";
import {
  HIVE_UI_CATALOG_ID,
  HIVE_UI_CATALOG_VERSION,
  HIVE_UI_TREE_SCHEMA_VERSION,
  type HiveUiElementMap,
  type HiveUiLivingCaseChapterKey,
  type HiveUiProSectionKey,
  type HiveUiTree,
} from "@hiveforyou/shared/hive-ui-tree";

function nextKey(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

function treeShell(
  projection: CanonicalStudyReportProjection,
  rootKey: string,
  elements: HiveUiElementMap,
  rootChildren: string[],
): HiveUiTree {
  elements[rootKey] = {
    type: "ReportRoot",
    props: {},
    children: rootChildren,
  };

  return {
    schemaVersion: HIVE_UI_TREE_SCHEMA_VERSION,
    caseId: projection.caseId,
    studyRunId: projection.studyRunId,
    audience: projection.audience,
    sourceReportArtifactHash: projection.sourceArtifactContentSha256,
    catalogId: HIVE_UI_CATALOG_ID,
    catalogVersion: HIVE_UI_CATALOG_VERSION,
    narrativeSource: projection.narrativeSource,
    root: rootKey,
    elements,
  };
}

function appendProSection(
  elements: HiveUiElementMap,
  rootChildren: string[],
  sectionKey: HiveUiProSectionKey,
  childKeys: string[],
  sectionIndex: number,
): void {
  if (childKeys.length === 0) {
    return;
  }
  const sectionKeyId = `pro-section-${sectionKey}-${sectionIndex}`;
  elements[sectionKeyId] = {
    type: "ProSection",
    props: { sectionKey },
    children: childKeys,
  };
  rootChildren.push(sectionKeyId);
}

function appendLivingCaseChapter(
  elements: HiveUiElementMap,
  rootChildren: string[],
  chapter: HiveUiLivingCaseChapterKey,
  childKeys: string[],
  chapterIndex: number,
): void {
  if (childKeys.length === 0) {
    return;
  }
  const chapterKey = `living-chapter-${chapter}-${chapterIndex}`;
  elements[chapterKey] = {
    type: "LivingCaseChapter",
    props: { chapter },
    children: childKeys,
  };
  rootChildren.push(chapterKey);
}

function buildCustomerTree(
  projection: Extract<CanonicalStudyReportProjection, { audience: "customer" }>,
): HiveUiTree {
  const body = projection.body;
  const elements: HiveUiElementMap = {};
  const rootChildren: string[] = [];

  const understandChildren: string[] = [];
  const discoverChildren: string[] = [];
  const actChildren: string[] = [];
  const verifyChildren: string[] = [];

  const headerKey = "report-header";
  elements[headerKey] = { type: "ReportHeader", props: {} };
  understandChildren.push(headerKey);

  if (body.importantFacts.length > 0) {
    const briefKey = "brief-insights";
    elements[briefKey] = {
      type: "BriefInsights",
      props: {
        claimRefs: body.importantFacts.slice(0, 8).map((fact) => fact.claimRef),
      },
    };
    understandChildren.push(briefKey);
  }

  const storySplit = Math.max(1, Math.ceil(body.storySections.length / 2));
  body.storySections.forEach((section, sectionIndex) => {
    const sectionKey = nextKey("story-section", sectionIndex);
    const factKeys: string[] = [];
    section.facts.forEach((fact, factIndex) => {
      const factKey = nextKey(`${sectionKey}-fact`, factIndex);
      elements[factKey] = {
        type: "FactRow",
        props: { claimRef: fact.claimRef },
      };
      factKeys.push(factKey);
    });
    elements[sectionKey] = {
      type: "StorySection",
      props: { sectionId: section.id },
      children: factKeys,
    };
    if (sectionIndex < storySplit) {
      understandChildren.push(sectionKey);
    } else {
      discoverChildren.push(sectionKey);
    }
  });

  if (body.changes.length > 0) {
    const changeKeys: string[] = [];
    body.changes.forEach((change, index) => {
      const key = nextKey("change", index);
      elements[key] = {
        type: "ChangePair",
        props: { relationId: change.relationId },
      };
      changeKeys.push(key);
    });
    const wrapperKey = "changes-section";
    elements[wrapperKey] = {
      type: "ChangesSection",
      props: {},
      children: changeKeys,
    };
    discoverChildren.push(wrapperKey);
  }

  if (body.supports.length > 0) {
    const supportKeys: string[] = [];
    body.supports.forEach((row, index) => {
      const key = nextKey("support", index);
      elements[key] = {
        type: "SupportPair",
        props: { relationId: row.relationId },
      };
      supportKeys.push(key);
    });
    const wrapperKey = "supports-section";
    elements[wrapperKey] = {
      type: "SupportsSection",
      props: {},
      children: supportKeys,
    };
    discoverChildren.push(wrapperKey);
  }

  if (body.openQuestions.length > 0) {
    const key = "open-questions";
    elements[key] = {
      type: "OpenQuestions",
      props: { questionIds: body.openQuestions.map((question) => question.id) },
    };
    actChildren.push(key);
  }

  if (body.storySections.length > 0) {
    const timelineKey = "timeline";
    elements[timelineKey] = {
      type: "Timeline",
      props: { storySectionIds: body.storySections.map((section) => section.id) },
    };
    verifyChildren.push(timelineKey);
  }

  let chapterIndex = 0;
  appendLivingCaseChapter(elements, rootChildren, "understand", understandChildren, chapterIndex++);
  appendLivingCaseChapter(elements, rootChildren, "discover", discoverChildren, chapterIndex++);
  appendLivingCaseChapter(elements, rootChildren, "act", actChildren, chapterIndex++);
  appendLivingCaseChapter(elements, rootChildren, "verify", verifyChildren, chapterIndex++);

  return treeShell(projection, "report-root", elements, rootChildren);
}

function buildProTree(projection: Extract<CanonicalStudyReportProjection, { audience: "pro" }>): HiveUiTree {
  const body = projection.body;
  const elements: HiveUiElementMap = {};
  const rootChildren: string[] = [];

  if (body.exportTables.length > 0) {
    const exportKeys: string[] = [];
    body.exportTables.forEach((_table, index) => {
      const key = nextKey("pro-export", index);
      elements[key] = {
        type: "ProExportBlock",
        props: { tableIndex: index },
      };
      exportKeys.push(key);
    });
    appendProSection(elements, rootChildren, "export", exportKeys, 0);
  }

  if (body.entityLedger.length > 0) {
    const ledgerKeys: string[] = [];
    body.entityLedger.forEach((row, index) => {
      const key = nextKey("ledger-fact", index);
      elements[key] = {
        type: "FactRow",
        props: { claimRef: row.claimRef },
      };
      ledgerKeys.push(key);
    });
    appendProSection(elements, rootChildren, "entity_ledger", ledgerKeys, 0);
  }

  if (body.quotations.length > 0) {
    const seenFieldKeys = new Set<string>();
    const quoteKeys: string[] = [];
    body.quotations.forEach((quote, index) => {
      if (seenFieldKeys.has(quote.claimRef.fieldKey)) {
        return;
      }
      seenFieldKeys.add(quote.claimRef.fieldKey);
      const key = nextKey("pro-quote", index);
      elements[key] = {
        type: "ProQuotationRow",
        props: { fieldKey: quote.claimRef.fieldKey },
      };
      quoteKeys.push(key);
    });
    appendProSection(elements, rootChildren, "quotations", quoteKeys, 0);
  }

  if (body.relations.length > 0) {
    const relationKeys: string[] = [];
    body.relations.forEach((relation, index) => {
      const key = nextKey("pro-relation", index);
      elements[key] = {
        type: "ProRelationRow",
        props: { relationId: relation.id },
      };
      relationKeys.push(key);
    });
    appendProSection(elements, rootChildren, "relations", relationKeys, 0);
  }

  if (body.operativeViews.length > 0) {
    const viewKeys: string[] = [];
    body.operativeViews.forEach((view, index) => {
      const key = nextKey("pro-operative", index);
      elements[key] = {
        type: "ProOperativeViewRow",
        props: { viewId: view.id },
      };
      viewKeys.push(key);
    });
    appendProSection(elements, rootChildren, "operative_views", viewKeys, 0);
  }

  if (body.requirements.length > 0) {
    const requirementKeys: string[] = [];
    body.requirements.forEach((row, index) => {
      const key = nextKey("pro-requirement", index);
      elements[key] = {
        type: "ProRequirementRow",
        props: { requirementId: row.id },
      };
      requirementKeys.push(key);
    });
    appendProSection(elements, rootChildren, "requirements", requirementKeys, 0);
  }

  if (body.flags.length > 0) {
    const flagKeys: string[] = [];
    body.flags.forEach((row, index) => {
      const key = nextKey("pro-flag", index);
      elements[key] = {
        type: "ProFlagRow",
        props: { flagId: row.id },
      };
      flagKeys.push(key);
    });
    appendProSection(elements, rootChildren, "flags", flagKeys, 0);
  }

  if (body.measurementSeries.length > 0) {
    const seriesKeys: string[] = [];
    body.measurementSeries.forEach((row, index) => {
      const key = nextKey("pro-series", index);
      elements[key] = {
        type: "MeasurementCard",
        props: { seriesId: row.id },
      };
      seriesKeys.push(key);
    });
    appendProSection(elements, rootChildren, "measurement_series", seriesKeys, 0);
  }

  return treeShell(projection, "report-root", elements, rootChildren);
}

/**
 * Pure deterministic UI tree from an already-projected canonical study report.
 * Does not invoke Reader, extraction, or canonical-study execution.
 */
export function buildDeterministicHiveUiTree(
  projection: CanonicalStudyReportProjection,
): HiveUiTree {
  if (projection.audience === "customer") {
    return buildCustomerTree(projection);
  }
  return buildProTree(projection);
}
