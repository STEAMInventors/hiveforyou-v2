import { describe, expect, it } from "vitest";

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
