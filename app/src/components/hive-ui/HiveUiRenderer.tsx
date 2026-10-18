"use client";

import { createRenderer } from "@json-render/react";
import type { Spec } from "@json-render/core";

import type { CanonicalStudyReportProjection } from "@hiveforyou/shared/canonical-study-report-projection";
import type { HiveUiTree } from "@hiveforyou/shared/hive-ui-tree";

import { hiveUiReportCatalog } from "./hive-ui-catalog";
import { hiveUiReportComponentMap } from "./hive-ui-report-components";
import { HiveUiReportEvidenceProvider } from "./hive-ui-report-evidence-context";
import { LivingCaseChapterNav } from "./living-case-chapter-nav";
import { HiveUiReportProjectionProvider } from "./hive-ui-report-projection-context";

const HiveUiReportRenderer = createRenderer(hiveUiReportCatalog, hiveUiReportComponentMap);

export function hiveUiTreeToSpec(tree: HiveUiTree): Spec {
  const elements: Spec["elements"] = {};
  for (const [key, element] of Object.entries(tree.elements)) {
    elements[key] = {
      type: element.type,
      props: element.props as Record<string, unknown>,
      children: element.children ?? [],
    };
  }
  return {
    root: tree.root,
    elements,
  };
}

function treeUsesLivingCaseChapters(tree: HiveUiTree): boolean {
  return Object.values(tree.elements).some((element) => element.type === "LivingCaseChapter");
}

export function HiveUiRenderer({
  projection,
  tree,
  studyRunId,
  presentation = "living-case",
}: {
  projection: CanonicalStudyReportProjection;
  tree: HiveUiTree;
  studyRunId: string;
  presentation?: "living-case" | "legacy";
}) {
  const spec = hiveUiTreeToSpec(tree);
  const audienceClass =
    projection.audience === "pro"
      ? "hive-inverted-report--pro"
      : "hive-inverted-report--customer";
  const livingCase =
    presentation === "living-case" &&
    projection.audience === "customer" &&
    treeUsesLivingCaseChapters(tree);

  const reportBody = (
    <article className="hive-inverted-report__article">
      {livingCase ? <LivingCaseChapterNav tree={tree} /> : null}
      <div className="hive-inverted-report__body">
        <HiveUiReportRenderer spec={spec} />
      </div>
    </article>
  );

  return (
    <HiveUiReportProjectionProvider projection={projection}>
      <HiveUiReportEvidenceProvider studyRunId={studyRunId}>
        <div
          className={`hive-inverted-report ${audienceClass} ${livingCase ? "hive-inverted-report--living-case" : ""}`}
          data-testid="hive-inverted-report"
          data-audience={projection.audience}
          data-narrative-source={tree.narrativeSource}
          data-presentation={livingCase ? "living-case" : "inverted"}
        >
          {reportBody}
        </div>
      </HiveUiReportEvidenceProvider>
    </HiveUiReportProjectionProvider>
  );
}
