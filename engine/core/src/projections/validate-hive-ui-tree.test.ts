import { describe, expect, it } from "vitest";

import { resolveCanonicalStudyReportPresentationMode } from "@hiveforyou/shared/canonical-study-report-projection";

import { projectCanonicalStudyReport } from "./project-canonical-study-report.js";
import { buildDeterministicHiveUiTree } from "./build-deterministic-hive-ui-tree.js";
import {
  assertHiveUiTree,
  HiveUiTreeValidationError,
  tryAssertHiveUiTree,
} from "./validate-hive-ui-tree.js";
import { CANONICAL_STUDY_DEBUG_PACK_APPROVAL } from "../study/resolve-approved-proposal-domain-pack.js";
import {
  buildSyntheticFoundation,
  mockPages,
  planGoalDoc,
  SYNTHETIC_PACK,
} from "../study/canonical-study/test-fixtures.js";
import { buildCanonicalStudy } from "../study/canonical-study/index.js";

const PACK_SHA = "a".repeat(64);

function buildSampleArtifact() {
  const foundation = buildSyntheticFoundation({
    documents: [
      {
        sourceDocumentId: "plan-a",
        pages: mockPages("plan-a", 1, "reading Read fluently"),
        parsedModelJson: planGoalDoc("plan-a", "doc.plan", "Read fluently", "2024-01-01"),
      },
      {
        sourceDocumentId: "plan-b",
        pages: mockPages("plan-b", 1, "reading Read fluently"),
        parsedModelJson: planGoalDoc("plan-b", "doc.plan", "Read fluently", "2025-01-01"),
      },
    ],
  });
  return buildCanonicalStudy({
    pack: SYNTHETIC_PACK,
    packContentSha256: PACK_SHA,
    foundation,
    studyRunId: "study-run-test",
    caseId: "case-test",
  });
}

function buildCustomerProjection() {
  const artifact = buildSampleArtifact();
  const projection = projectCanonicalStudyReport({
    artifact,
    audience: "customer",
    customerProReportsPermitted: false,
    packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
  });
  return { artifact, projection };
}

function buildProProjection() {
  const artifact = buildSampleArtifact();
  const projection = projectCanonicalStudyReport({
    artifact,
    audience: "pro",
    customerProReportsPermitted: false,
    packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
  });
  return { artifact, projection };
}

describe("validate-hive-ui-tree", () => {
  it("accepts deterministic customer tree with valid claim refs", () => {
    const { artifact, projection } = buildCustomerProjection();
    const tree = buildDeterministicHiveUiTree(projection);
    expect(() => assertHiveUiTree(artifact, projection, tree)).not.toThrow();
  });

  it("accepts deterministic pro tree", () => {
    const { artifact, projection } = buildProProjection();
    const tree = buildDeterministicHiveUiTree(projection);
    expect(tree.audience).toBe("pro");
    expect(() => assertHiveUiTree(artifact, projection, tree)).not.toThrow();
  });

  it("groups customer changes under a single ChangesSection", () => {
    const { projection } = buildCustomerProjection();
    const tree = buildDeterministicHiveUiTree(projection);
    if (projection.body.changes.length === 0) {
      expect(tree.elements["changes-section"]).toBeUndefined();
      return;
    }
    const section = tree.elements["changes-section"];
    expect(section?.type).toBe("ChangesSection");
    expect(section?.children?.every((key) => tree.elements[key]?.type === "ChangePair")).toBe(
      true,
    );
  });

  it("includes SupportsSection when projection has supports", () => {
    const { artifact, projection } = buildCustomerProjection();
    projection.body.supports.push({
      relationId: "support-test",
      label: "MATCHES",
      left: projection.body.storySections[0]!.facts[0]!,
      right: projection.body.storySections[0]!.facts[0]!,
    });
    const tree = buildDeterministicHiveUiTree(projection);
    expect(tree.elements["supports-section"]?.type).toBe("SupportsSection");
    expect(() => assertHiveUiTree(artifact, projection, tree)).not.toThrow();
  });

  it("rejects invalid claim reference", () => {
    const { artifact, projection } = buildCustomerProjection();
    const tree = buildDeterministicHiveUiTree(projection);
    const factKey = Object.keys(tree.elements).find(
      (key) => tree.elements[key]?.type === "FactRow",
    )!;
    tree.elements[factKey] = {
      type: "FactRow",
      props: { claimRef: { fieldKey: "missing-field-key" } },
    };
    expect(() => assertHiveUiTree(artifact, projection, tree)).toThrow(HiveUiTreeValidationError);
  });

  it("rejects unsupported component type", () => {
    const { artifact, projection } = buildCustomerProjection();
    const tree = buildDeterministicHiveUiTree(projection);
    tree.elements["rogue"] = {
      type: "UnknownWidget" as "FactRow",
      props: { claimRef: { fieldKey: "x" } },
    };
    expect(() => assertHiveUiTree(artifact, projection, tree)).toThrow(HiveUiTreeValidationError);
  });

  it("rejects raw factual text props", () => {
    const { artifact, projection } = buildCustomerProjection();
    const tree = buildDeterministicHiveUiTree(projection);
    tree.elements["rogue-fact"] = {
      type: "FactRow",
      props: { claimRef: { fieldKey: "a" }, displayText: "fabricated" } as never,
    };
    expect(() => assertHiveUiTree(artifact, projection, tree)).toThrow(HiveUiTreeValidationError);
  });

  it("rejects source artifact hash mismatch", () => {
    const { artifact, projection } = buildCustomerProjection();
    const tree = buildDeterministicHiveUiTree(projection);
    tree.sourceReportArtifactHash = "b".repeat(64);
    expect(() => assertHiveUiTree(artifact, projection, tree)).toThrow(HiveUiTreeValidationError);
  });

  it("rejects fact rows with missing evidence", () => {
    const { artifact, projection } = buildCustomerProjection();
    const fact = projection.body.storySections.flatMap((section) => section.facts)[0];
    if (!fact) {
      return;
    }
    fact.evidence = [];
    const tree = buildDeterministicHiveUiTree(projection);
    tree.elements["evidence-test-fact"] = {
      type: "FactRow",
      props: { claimRef: fact.claimRef },
    };
    tree.elements["report-root"]!.children!.push("evidence-test-fact");
    expect(() => assertHiveUiTree(artifact, projection, tree)).toThrow(HiveUiTreeValidationError);
  });

  it("rejects classified claims presented as evidence chips", () => {
    const { artifact, projection } = buildCustomerProjection();
    const fact = projection.body.storySections.flatMap((section) => section.facts)[0]!;
    fact.assertionKind = "classified";
    const tree = buildDeterministicHiveUiTree(projection);
    tree.elements["classified-chip"] = {
      type: "EvidenceChip",
      props: { claimRef: fact.claimRef, evidenceIndex: 0 },
    };
    tree.elements["report-root"]!.children!.push("classified-chip");
    expect(() => assertHiveUiTree(artifact, projection, tree)).toThrow(HiveUiTreeValidationError);
  });

  it("rejects pro tree validated against customer projection", () => {
    const { artifact, projection } = buildProProjection();
    const tree = buildDeterministicHiveUiTree(projection);
    const customerProjection = projectCanonicalStudyReport({
      artifact,
      audience: "customer",
      customerProReportsPermitted: false,
      packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
    });
    expect(() => assertHiveUiTree(artifact, customerProjection, tree)).toThrow(
      HiveUiTreeValidationError,
    );
  });

  it("returns null for invalid tree via tryAssertHiveUiTree", () => {
    const { artifact, projection } = buildCustomerProjection();
    const tree = buildDeterministicHiveUiTree(projection);
    tree.sourceReportArtifactHash = "c".repeat(64);
    expect(tryAssertHiveUiTree(artifact, projection, tree)).toBeNull();
  });

  it("does not invoke canonical-study execution when building the UI tree", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    const filePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "build-deterministic-hive-ui-tree.ts",
    );
    const source = await readFile(filePath, "utf8");
    expect(source).not.toMatch(/buildCanonicalStudy|study\/canonical-study/);
  });

  it("preserves customer and pro approval gates in projection metadata", () => {
    expect(
      resolveCanonicalStudyReportPresentationMode({
        customerProReportsPermitted: false,
        packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
      }),
    ).toBe("internal_preview");
    expect(
      resolveCanonicalStudyReportPresentationMode({
        customerProReportsPermitted: true,
        packApprovalLabel: "APPROVED_PACK",
      }),
    ).toBe("approved");
  });
});
