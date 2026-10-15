import { describe, expect, it } from "vitest";

import { resolveCanonicalStudyReportPresentationMode } from "@hiveforyou/shared/canonical-study-report-projection";

import { projectCanonicalStudyReport } from "../../projections/project-canonical-study-report.js";
import {
  assertCanonicalStudyReportProjection,
  CanonicalStudyReportProjectionValidationError,
} from "../../projections/validate-canonical-study-report-projection.js";
import { CANONICAL_STUDY_DEBUG_PACK_APPROVAL } from "../resolve-approved-proposal-domain-pack.js";
import { buildCanonicalStudy } from "./index.js";
import {
  buildSyntheticFoundation,
  mockPages,
  planGoalDoc,
  docWithStudent,
  SYNTHETIC_PACK,
} from "./test-fixtures.js";
import { buildCanonicalStudyFoundation } from "../canonical-study-foundation/index.js";

const PACK_SHA = "a".repeat(64);

describe("buildCanonicalStudy", () => {
  it("resolves cross-document identity by content keys", () => {
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
    const study = buildCanonicalStudy({
      pack: SYNTHETIC_PACK,
      packContentSha256: PACK_SHA,
      foundation,
    });
    expect(
      study.entities.some((entity) => entity.recordTypeId === "goal" && entity.recordVersions.length === 2),
    ).toBe(true);
  });

  it("does not merge case singleton without guaranteed_unique", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      recordTypes: SYNTHETIC_PACK.recordTypes.map((record) =>
        record.id === "student"
          ? { ...record, identity: { ...record.identity, caseSingletonMerge: "never_auto_merge" as const } }
          : record,
      ),
    };
    const foundation = buildSyntheticFoundation({
      documents: [docWithStudent("doc-1", "Alice", "2010-01-01"), docWithStudent("doc-2", "Alice", "2010-01-02")],
    });
    const study = buildCanonicalStudy({ pack, packContentSha256: PACK_SHA, foundation });
    expect(study.entities.filter((entity) => entity.recordTypeId === "student")).toHaveLength(2);
  });

  it("merges guaranteed_unique singleton when no contradictory evidence", () => {
    const foundation = buildSyntheticFoundation({
      documents: [docWithStudent("doc-1", "Alice", "2010-01-01"), docWithStudent("doc-2", "Alice", "2010-01-01")],
    });
    const study = buildCanonicalStudy({ pack: SYNTHETIC_PACK, packContentSha256: PACK_SHA, foundation });
    expect(study.entities.filter((entity) => entity.recordTypeId === "student")).toHaveLength(1);
  });

  it("labels CHANGE only with verified temporal succession", () => {
    const foundation = buildSyntheticFoundation({
      documents: [
        {
          sourceDocumentId: "plan-a",
          pages: mockPages("plan-a", 1, "reading Goal A 2024-01-01"),
          parsedModelJson: planGoalDoc("plan-a", "doc.plan", "Goal A", "2024-01-01"),
        },
        {
          sourceDocumentId: "plan-b",
          pages: mockPages("plan-b", 1, "reading Goal B 2025-06-01"),
          parsedModelJson: planGoalDoc("plan-b", "doc.plan", "Goal B", "2025-06-01"),
        },
      ],
    });
    const study = buildCanonicalStudy({ pack: SYNTHETIC_PACK, packContentSha256: PACK_SHA, foundation });
    expect(study.relations.some((relation) => relation.label === "CHANGE")).toBe(true);
    expect(study.relations.find((relation) => relation.label === "CHANGE")?.temporalBasis).toMatch(/event_dates/);
  });

  it("does not label CHANGE without event chronology when required", () => {
    const pack = {
      ...SYNTHETIC_PACK,
      relationshipRules: {
        changeRequiresTemporalSuccession: true,
        temporalSuccessionFieldIds: [],
        conflictWhenDifferentParties: true,
      },
    };
    const foundation = buildSyntheticFoundation({
      documents: [
        {
          sourceDocumentId: "plan-a",
          pages: mockPages("plan-a", 1, "reading Same 2024-01-01"),
          parsedModelJson: planGoalDoc("plan-a", "doc.plan", "Same", "2024-01-01", false),
        },
        {
          sourceDocumentId: "plan-b",
          pages: mockPages("plan-b", 1, "reading Different 2025-01-01"),
          parsedModelJson: planGoalDoc("plan-b", "doc.plan", "Different", "2025-01-01", false),
        },
      ],
    });
    const study = buildCanonicalStudy({ pack, packContentSha256: PACK_SHA, foundation });
    expect(study.relations.some((relation) => relation.label === "CHANGE")).toBe(false);
    expect(study.unresolvedComparisons.length).toBeGreaterThan(0);
  });

  it("does not emit positive findings for partial insight primitives", () => {
    const foundation = buildSyntheticFoundation({
      documents: [
        {
          sourceDocumentId: "plan-a",
          pages: mockPages("plan-a", 1, "reading Goal"),
          parsedModelJson: planGoalDoc("plan-a", "doc.plan", "Goal", "2024-01-01"),
        },
      ],
    });
    const study = buildCanonicalStudy({ pack: SYNTHETIC_PACK, packContentSha256: PACK_SHA, foundation });
    expect(study.flags.find((flag) => flag.checkId === "partial_check")?.status).toBe("unsupported");
  });

  it("produces deterministic contentSha256 excluding createdAt", () => {
    const foundation = buildSyntheticFoundation({
      documents: [
        {
          sourceDocumentId: "plan-a",
          pages: mockPages("plan-a", 1, "reading Goal"),
          parsedModelJson: planGoalDoc("plan-a", "doc.plan", "Goal", "2024-01-01"),
        },
      ],
    });
    const first = buildCanonicalStudy({
      pack: SYNTHETIC_PACK,
      packContentSha256: PACK_SHA,
      foundation,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const second = buildCanonicalStudy({
      pack: SYNTHETIC_PACK,
      packContentSha256: PACK_SHA,
      foundation,
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    expect(first.contentSha256).toBe(second.contentSha256);
  });

  it("rejects pack metadata inconsistent with foundation", () => {
    const foundation = buildSyntheticFoundation({
      documents: [
        {
          sourceDocumentId: "plan-a",
          pages: mockPages("plan-a", 1, "reading Goal"),
          parsedModelJson: planGoalDoc("plan-a", "doc.plan", "Goal", "2024-01-01"),
        },
      ],
    });
    expect(() =>
      buildCanonicalStudy({
        pack: { ...SYNTHETIC_PACK, manifest: { ...SYNTHETIC_PACK.manifest, version: "9.9.9" } },
        packContentSha256: PACK_SHA,
        foundation,
      }),
    ).toThrow(/PACK_MISMATCH/);
  });

  it("regression: foundation builder remains available", () => {
    expect(typeof buildCanonicalStudyFoundation).toBe("function");
  });
});

describe("projectCanonicalStudyReport", () => {
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
          pages: mockPages("plan-b", 1, "reading Read faster"),
          parsedModelJson: planGoalDoc("plan-b", "doc.plan", "Read faster", "2025-01-01"),
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

  it("projects customer and pro audiences deterministically", () => {
    const artifact = buildSampleArtifact();
    const publication = {
      customerProReportsPermitted: false,
      packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
    };

    const customer = projectCanonicalStudyReport({
      artifact,
      audience: "customer",
      ...publication,
    });
    const pro = projectCanonicalStudyReport({
      artifact,
      audience: "pro",
      ...publication,
    });

    expect(customer.audience).toBe("customer");
    expect(pro.audience).toBe("pro");
    expect(customer.presentationMode).toBe("internal_preview");
    expect(pro.body.entityLedger.length).toBeGreaterThan(0);
  });

  it("requires evidence-backed claim refs for customer facts", () => {
    const artifact = buildSampleArtifact();
    const customer = projectCanonicalStudyReport({
      artifact,
      audience: "customer",
      customerProReportsPermitted: false,
      packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
    });

    for (const section of customer.body.storySections) {
      for (const fact of section.facts) {
        expect(fact.evidence.length).toBeGreaterThan(0);
      }
    }
  });

  it("labels classified fields without promoting them to verified quotes", () => {
    const artifact = buildSampleArtifact();
    const chip = artifact.relations[0]?.left ?? artifact.entities[0]?.recordVersions[0]?.provenanceByFieldKey[
      artifact.entities[0]!.recordVersions[0]!.fieldKeys[0]!
    ];
    expect(chip).toBeTruthy();
    chip!.provenanceClass = "classified";
    const fieldKey = chip!.fieldKey;

    const customer = projectCanonicalStudyReport({
      artifact,
      audience: "customer",
      customerProReportsPermitted: false,
      packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
    });

    const classifiedFact = customer.body.storySections
      .flatMap((section) => section.facts)
      .find((fact) => fact.claimRef.fieldKey === fieldKey);
    expect(classifiedFact?.assertionKind).toBe("classified");
  });

  it("omits unsupported flags from open questions", () => {
    const artifact = buildSampleArtifact();
    artifact.flags.push({
      id: "flag-unsupported",
      checkId: "partial_check",
      status: "unsupported",
      question: "Should not appear",
      operands: [],
      message: "Primitive operands incomplete",
    });

    const customer = projectCanonicalStudyReport({
      artifact,
      audience: "customer",
      customerProReportsPermitted: false,
      packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
    });

    expect(customer.body.openQuestions.some((item) => item.id === "flag-unsupported")).toBe(false);
  });

  it("gates publication mode on pack approval metadata", () => {
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

  it("regression: indexes provenance when record versions key chips by fieldId", () => {
    const artifact = buildSampleArtifact();
    const resolvedVersion = artifact.entities
      .flatMap((entity) => entity.recordVersions)
      .find((version) => Object.keys(version.provenanceByFieldKey).length > 0)!;
    const sampleChip = Object.values(resolvedVersion.provenanceByFieldKey)[0]!;
    expect(sampleChip.fieldKey).toContain("|");
    expect(resolvedVersion.fieldKeys).toContain(sampleChip.fieldKey);

    artifact.entities.push({
      id: "entity-identity-unresolved",
      recordTypeId: "goal",
      status: "identity_unresolved",
      contentKey: null,
      reasons: ["conflicting_identity_keys"],
      recordVersions: [
        {
          ...resolvedVersion,
          recordGroupId: "unresolved-group",
          instanceIndex: 99,
          fieldKeys: [sampleChip.fieldKey],
          provenanceByFieldKey: {
            [sampleChip.fieldId]: { ...sampleChip },
          },
        },
      ],
    });

    const publication = {
      customerProReportsPermitted: false,
      packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
    };

    const customer = projectCanonicalStudyReport({
      artifact,
      audience: "customer",
      ...publication,
    });
    const pro = projectCanonicalStudyReport({
      artifact,
      audience: "pro",
      ...publication,
    });

    const identityQuestion = customer.body.openQuestions.find(
      (item) => item.id === "identity:entity-identity-unresolved",
    );
    expect(identityQuestion?.kind).toBe("identity_unresolved");
    expect(identityQuestion?.claimRefs).toEqual([
      { fieldKey: sampleChip.fieldKey, contextKind: "provenance_chip", contextId: "entity-identity-unresolved" },
    ]);
    expect(pro.body.entityLedger.some((row) => row.claimRef.fieldKey === sampleChip.fieldKey)).toBe(true);
  });

  it("rejects projections with unknown claim refs", () => {
    const artifact = buildSampleArtifact();
    const customer = projectCanonicalStudyReport({
      artifact,
      audience: "customer",
      customerProReportsPermitted: false,
      packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
    });

    customer.body.importantFacts.push({
      claimRef: { fieldKey: "missing-field-key" },
      entityId: null,
      recordTypeId: "goal",
      fieldId: "statement",
      sourceDocumentId: "plan-a",
      displayText: "fabricated",
      assertionKind: "verified_quoted",
      evidence: [
        {
          claimRef: { fieldKey: "missing-field-key" },
          sourceDocumentId: "plan-a",
          page: 1,
          quote: "fabricated",
          provenanceClass: "quoted",
        },
      ],
    });

    expect(() => assertCanonicalStudyReportProjection(artifact, customer)).toThrow(
      CanonicalStudyReportProjectionValidationError,
    );
  });
});
