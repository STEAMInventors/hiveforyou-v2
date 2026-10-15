import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CanonicalStudyReportProjection } from "@hiveforyou/shared/canonical-study-report-projection";
import type { HiveUiTree } from "@hiveforyou/shared/hive-ui-tree";
import {
  HIVE_UI_CATALOG_ID,
  HIVE_UI_CATALOG_VERSION,
  HIVE_UI_TREE_SCHEMA_VERSION,
} from "@hiveforyou/shared/hive-ui-tree";

import { HiveUiRenderer } from "./HiveUiRenderer";

const projection = {
  schemaVersion: "canonical-study-report/1",
  audience: "customer",
  presentationMode: "internal_preview",
  customerProReportsPermitted: false,
  packApprovalLabel: "DEBUG_UNAPPROVED_PACK",
  packId: "synthetic",
  packVersion: "0.0.0",
  narrativeSource: "deterministic",
  sourceArtifactContentSha256: "e".repeat(64),
  studyRunId: "study-ui-test",
  caseId: "case-ui-test",
  body: {
    storySections: [
      {
        id: "section-1",
        sortRank: 0,
        sourceDocumentId: "plan-a",
        documentTypeId: "doc.plan",
        orderingDate: "2024-01-01",
        title: "Annual plan",
        facts: [
          {
            claimRef: { fieldKey: "goal.statement|plan-a|0" },
            entityId: "entity-1",
            recordTypeId: "goal",
            fieldId: "statement",
            sourceDocumentId: "plan-a",
            displayText: "Read fluently",
            assertionKind: "verified_quoted",
            evidence: [
              {
                claimRef: { fieldKey: "goal.statement|plan-a|0" },
                sourceDocumentId: "plan-a",
                page: 1,
                quote: "Read fluently",
                provenanceClass: "quoted",
              },
            ],
          },
        ],
      },
    ],
    importantFacts: [],
    changes: [],
    supports: [],
    openQuestions: [],
  },
} satisfies CanonicalStudyReportProjection;

const tree: HiveUiTree = {
  schemaVersion: HIVE_UI_TREE_SCHEMA_VERSION,
  caseId: projection.caseId,
  studyRunId: projection.studyRunId,
  audience: "customer",
  sourceReportArtifactHash: projection.sourceArtifactContentSha256,
  catalogId: HIVE_UI_CATALOG_ID,
  catalogVersion: HIVE_UI_CATALOG_VERSION,
  narrativeSource: "deterministic",
  root: "root",
  elements: {
    root: {
      type: "ReportRoot",
      props: {},
      children: ["section-1"],
    },
    "section-1": {
      type: "StorySection",
      props: { sectionId: "section-1" },
      children: ["fact-1"],
    },
    "fact-1": {
      type: "FactRow",
      props: { claimRef: { fieldKey: "goal.statement|plan-a|0" } },
    },
  },
};

describe("HiveUiRenderer", () => {
  it("renders validated canonical references from the report projection", () => {
    render(<HiveUiRenderer projection={projection} tree={tree} />);

    expect(screen.getByTestId("hive-ui-report-root")).toBeInTheDocument();
    expect(screen.getAllByText(/goal\.statement/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Read fluently").length).toBeGreaterThan(0);
    expect(screen.getByText("p.1")).toBeInTheDocument();
  });
});
