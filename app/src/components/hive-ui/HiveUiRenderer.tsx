"use client";

import { createRenderer } from "@json-render/react";
import type { Spec } from "@json-render/core";

import type { CanonicalStudyReportProjection } from "@hiveforyou/shared/canonical-study-report-projection";
import type { HiveUiTree } from "@hiveforyou/shared/hive-ui-tree";

import { hiveUiReportCatalog } from "./hive-ui-catalog";
import { hiveUiReportComponentMap } from "./hive-ui-report-components";
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

export function HiveUiRenderer({
  projection,
  tree,
}: {
  projection: CanonicalStudyReportProjection;
  tree: HiveUiTree;
}) {
  const spec = hiveUiTreeToSpec(tree);
  const audienceClass =
    projection.audience === "pro"
      ? "hive-inverted-report--pro"
      : "hive-inverted-report--customer";
  return (
    <HiveUiReportProjectionProvider projection={projection}>
      <div
        className={`hive-inverted-report ${audienceClass}`}
        data-testid="hive-inverted-report"
        data-audience={projection.audience}
        data-narrative-source={tree.narrativeSource}
      >
        <article className="hive-inverted-report__article">
          <div className="hive-inverted-report__body">
            <HiveUiReportRenderer spec={spec} />
          </div>
        </article>
      </div>
    </HiveUiReportProjectionProvider>
  );
}
