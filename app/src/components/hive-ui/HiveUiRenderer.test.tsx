import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CanonicalStudyReportProjection } from "@hiveforyou/shared/canonical-study-report-projection";
import type { HiveUiTree } from "@hiveforyou/shared/hive-ui-tree";
import {
  HIVE_UI_CATALOG_ID,
  HIVE_UI_CATALOG_VERSION,
  HIVE_UI_TREE_SCHEMA_VERSION,
} from "@hiveforyou/shared/hive-ui-tree";

import { HiveUiRenderer } from "./HiveUiRenderer";

const customerProjection = {
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
          {
            claimRef: { fieldKey: "goal.statement|plan-a|1" },
            entityId: "entity-1",
            recordTypeId: "goal",
            fieldId: "statement",
            sourceDocumentId: "plan-a",
            displayText: "Write clearly",
            assertionKind: "verified_quoted",
            evidence: [
              {
                claimRef: { fieldKey: "goal.statement|plan-a|1" },
                sourceDocumentId: "plan-a",
                page: 2,
                quote: "Write clearly",
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

const customerStoryTree: HiveUiTree = {
  schemaVersion: HIVE_UI_TREE_SCHEMA_VERSION,
  caseId: customerProjection.caseId,
  studyRunId: customerProjection.studyRunId,
  audience: "customer",
  sourceReportArtifactHash: customerProjection.sourceArtifactContentSha256,
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
      children: ["fact-1", "fact-2"],
    },
    "fact-1": {
      type: "FactRow",
      props: { claimRef: { fieldKey: "goal.statement|plan-a|0" } },
    },
    "fact-2": {
      type: "FactRow",
      props: { claimRef: { fieldKey: "goal.statement|plan-a|1" } },
    },
  },
};

const customerChangesTree: HiveUiTree = {
  ...customerStoryTree,
  narrativeSource: "writer_validated",
  root: "root-changes",
  elements: {
    "root-changes": {
      type: "ReportRoot",
      props: {},
      children: ["changes-section"],
    },
    "changes-section": {
      type: "ChangesSection",
      props: {},
      children: ["change-1"],
    },
    "change-1": {
      type: "ChangePair",
      props: { relationId: "rel-1" },
    },
  },
};

const proProjection = {
  ...customerProjection,
  audience: "pro",
  body: {
    exportTables: [],
    entityLedger: [
      {
        claimRef: { fieldKey: "goal.statement|plan-a|0" },
        entityId: "entity-1",
        recordTypeId: "goal",
        fieldId: "statement",
        sourceDocumentId: "plan-a",
        displayText: "Read fluently",
        assertionKind: "verified_quoted",
        entityStatus: null,
        instanceIndex: 0,
        envelopeRef: {
          studyRunId: "study-ui-test",
          attemptId: "attempt-1",
          sourceDocumentId: "plan-a",
          envelopeStatus: "verified",
        },
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
    quotations: [],
    relations: [],
    operativeViews: [],
    requirements: [],
    flags: [],
    measurementSeries: [],
  },
} as CanonicalStudyReportProjection;

const proLedgerTree: HiveUiTree = {
  schemaVersion: HIVE_UI_TREE_SCHEMA_VERSION,
  caseId: proProjection.caseId,
  studyRunId: proProjection.studyRunId,
  audience: "pro",
  sourceReportArtifactHash: proProjection.sourceArtifactContentSha256,
  catalogId: HIVE_UI_CATALOG_ID,
  catalogVersion: HIVE_UI_CATALOG_VERSION,
  narrativeSource: "writer_validated",
  root: "pro-root",
  elements: {
    "pro-root": {
      type: "ReportRoot",
      props: {},
      children: ["pro-section-entity_ledger-0"],
    },
    "pro-section-entity_ledger-0": {
      type: "ProSection",
      props: { sectionKey: "entity_ledger" },
      children: ["ledger-fact-0"],
    },
    "ledger-fact-0": {
      type: "FactRow",
      props: { claimRef: { fieldKey: "goal.statement|plan-a|0" } },
    },
  },
};

const STUDY_RUN_ID = customerProjection.studyRunId;

describe("HiveUiRenderer", () => {
  it("renders validated canonical references from the report projection", () => {
    render(
      <HiveUiRenderer
        projection={customerProjection}
        tree={customerStoryTree}
        studyRunId={STUDY_RUN_ID}
      />,
    );

    expect(screen.getByTestId("hive-inverted-report")).toHaveAttribute("data-audience", "customer");
    expect(screen.getByTestId("hive-ui-report-root")).toBeInTheDocument();
    expect(screen.getByTestId("hive-ui-section-section-1")).toBeInTheDocument();
    expect(screen.getAllByText("Read fluently").length).toBeGreaterThan(0);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders different valid UI trees with different section structure", () => {
    const { rerender } = render(
      <HiveUiRenderer
        projection={customerProjection}
        tree={customerStoryTree}
        studyRunId={STUDY_RUN_ID}
      />,
    );
    expect(screen.getByTestId("hive-ui-section-section-1")).toBeInTheDocument();
    expect(screen.queryByTestId("hive-ui-section-changes")).not.toBeInTheDocument();

    rerender(
      <HiveUiRenderer
        projection={{
          ...customerProjection,
          body: {
            ...customerProjection.body,
            changes: [
              {
                relationId: "rel-1",
                fieldId: "statement",
                entityId: "entity-1",
                label: "CHANGE",
                temporalBasis: null,
                left: customerProjection.body.storySections[0]!.facts[0]!,
                right: customerProjection.body.storySections[0]!.facts[1]!,
              },
            ],
          },
        }}
        tree={customerChangesTree}
        studyRunId={STUDY_RUN_ID}
      />,
    );

    expect(screen.queryByTestId("hive-ui-section-section-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("hive-ui-section-changes")).toBeInTheDocument();
  });

  it("keeps source page references on every rendered customer fact", () => {
    render(
      <HiveUiRenderer
        projection={customerProjection}
        tree={customerStoryTree}
        studyRunId={STUDY_RUN_ID}
      />,
    );
    const factNodes = screen.getAllByTestId(/^hive-ui-fact-/);
    expect(factNodes.length).toBe(2);
    for (const factNode of factNodes) {
      expect(within(factNode).getByTestId("hive-ui-evidence-chip")).toBeInTheDocument();
    }
  });

  it("renders pro Writer trees with pro section containers distinct from customer story sections", () => {
    render(
      <HiveUiRenderer projection={proProjection} tree={proLedgerTree} studyRunId={STUDY_RUN_ID} />,
    );
    expect(screen.getByTestId("hive-inverted-report")).toHaveAttribute("data-audience", "pro");
    expect(screen.getByTestId("hive-ui-pro-section-entity_ledger")).toBeInTheDocument();
    expect(screen.queryByTestId("hive-ui-section-section-1")).not.toBeInTheDocument();
  });
});
