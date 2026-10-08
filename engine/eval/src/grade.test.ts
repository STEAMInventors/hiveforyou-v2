import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { PageModel } from "@hiveforyou/core/document/page-model";
import type { CanonicalStudyProposalV4, ProposedClaimV4 } from "@hiveforyou/shared/case-intelligence/4";
import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";
import { describe, expect, it } from "vitest";

import {
  assertCertifiedGolden,
  claimValuesEquivalent,
  gradeGoldenProposal,
  GoldenNotCertifiedError,
  type GradeCorpusContext,
} from "./grade.js";
import type { CertifiedGoldenCase, GoldenCase, GoldenFact } from "./golden/types.js";
import { validateGoldenCase } from "./golden/validate.js";

const repoRoot = resolve(import.meta.dirname, "../../..");

function minimalRecoveredPage(pageNumber: number, sourceDocumentId: string): NestIepRecoveredPage {
  return {
    runId: "run_test",
    sourceDocumentId,
    pageNumber,
    extractionMethod: "NATIVE",
    canonicalText: "",
    lines: [],
    blocks: [],
    sourceIssues: [],
  };
}

function pageModelFromWords(documentId: string, pageNumber: number, texts: string[]): PageModel {
  return {
    documentId,
    pageNumber,
    width: 612,
    height: 792,
    rotation: 0,
    route: "native",
    quality: {
      garbageRatio: 0,
      illegibleRegions: [],
      meanConfidence: null,
      textCoverage: null,
    },
    imageRef: null,
    words: texts.map((text, seq) => ({
      text,
      seq,
      source: "native" as const,
      bbox: [0, 0, 1, 1],
      fontName: null,
      fontSize: 10,
      bold: null,
      italic: null,
      confidence: null,
    })),
  };
}

function corpus(docId: string, page: PageModel, recovered: NestIepRecoveredPage): GradeCorpusContext {
  return {
    pageModelsByDocumentId: new Map([[docId, [page]]]),
    recoveredPagesByDocumentId: new Map([[docId, [recovered]]]),
  };
}

function baseProposal(claims: ProposedClaimV4[]): CanonicalStudyProposalV4 {
  return {
    schemaVersion: "canonical-study-proposal/4",
    domainId: "iep",
    entities: [
      {
        id: "ent_1",
        entityType: "student",
        label: "Student",
        evidenceRefs: [
          {
            id: "ev_ent",
            sourceDocumentId: "doc.pdf",
            quote: "Student",
            sourceType: "document",
            page: 1,
          },
        ],
      },
    ],
    claims,
    conflicts: [],
    missingInformation: [],
    voiceProposal: null,
    modelMetadata: { providerId: "test", proposalMode: "fixture" },
    proposedAt: "2026-01-01T00:00:00.000Z",
  };
}

function certifiedGolden(partial: Omit<CertifiedGoldenCase, "verifiedBy" | "draft">): CertifiedGoldenCase {
  return { ...partial, verifiedBy: "test-reviewer", draft: false };
}

function goldenFact(partial: Partial<GoldenFact> & Pick<GoldenFact, "id" | "wordRange" | "value">): GoldenFact {
  return {
    documentId: "doc.pdf",
    pageNumber: 1,
    valueKind: partial.value.kind,
    acceptableModalities: ["observed"],
    ...partial,
  };
}

describe("gradeGoldenProposal", () => {
  const docId = "doc.pdf";
  const page = pageModelFromWords(docId, 1, ["2017-04-18", "grade", "2", "extra"]);
  const ctx = corpus(docId, page, minimalRecoveredPage(1, docId));

  it("A. determinism", () => {
    const golden = certifiedGolden({
      caseId: "det",
      split: "tune",
      corpusDir: "engine/intake/fixtures/l001",
      facts: [
        goldenFact({
          id: "f_dob",
          wordRange: [0, 1],
          value: { kind: "date", dateValue: "2017-04-18" },
        }),
      ],
      gaps: [],
      tripwires: [],
    });
    const proposal = baseProposal([
      {
        id: "c_dob",
        subjectEntityId: "ent_1",
        construct: { measure: "dob" },
        value: { kind: "date", dateValue: "2017-04-18" },
        modality: "observed",
        evidenceRefs: [
          {
            id: "ev1",
            sourceDocumentId: docId,
            page: 1,
            quote: "2017-04-18",
            sourceType: "document",
          },
        ],
      },
    ]);
    expect(gradeGoldenProposal({ golden, proposal, corpus: ctx })).toEqual(
      gradeGoldenProposal({ golden, proposal, corpus: ctx }),
    );
  });

  it("B. perfect candidate", () => {
    const golden = certifiedGolden({
      caseId: "perfect",
      split: "tune",
      corpusDir: "engine/intake/fixtures/l001",
      facts: [
        goldenFact({
          id: "f1",
          wordRange: [0, 1],
          value: { kind: "date", dateValue: "2017-04-18" },
        }),
      ],
      gaps: [{ id: "gap_1", gapKind: "not_found_in_supplied_documents", description: "missing" }],
      tripwires: [],
    });
    const proposal = baseProposal([
      {
        id: "c1",
        subjectEntityId: "ent_1",
        construct: { measure: "dob" },
        value: { kind: "date", dateValue: "2017-04-18" },
        modality: "observed",
        evidenceRefs: [
          {
            id: "ev1",
            sourceDocumentId: docId,
            page: 1,
            quote: "2017-04-18",
            sourceType: "document",
          },
        ],
      },
    ]);
    proposal.missingInformation = [
      {
        id: "candidate_gap_run_abc",
        description: "missing",
        gapKind: "not_found_in_supplied_documents",
        proposalLineage: { proposalItemId: "candidate_gap_run_abc", studyRunId: "sr" },
      },
    ];
    const result = gradeGoldenProposal({ golden, proposal, corpus: ctx });
    expect(result.score).toBe(1);
    expect(result.failures).toHaveLength(0);
    expect(result.metrics.precision).toBe(1);
    expect(result.metrics.recall).toBe(1);
    expect(result.metrics.abstention).toBe(1);
  });

  it("C. each failure kind once", () => {
    const golden = certifiedGolden({
      caseId: "all_failures",
      split: "tune",
      corpusDir: "engine/intake/fixtures/l001",
      facts: [
        goldenFact({ id: "fact_missed", wordRange: [3, 4], value: { kind: "text", textValue: "extra" } }),
        goldenFact({ id: "fact_value", wordRange: [0, 1], value: { kind: "date", dateValue: "2017-04-18" } }),
      ],
      gaps: [
        {
          id: "gap_abstain",
          gapKind: "not_found_in_supplied_documents",
          description: "x",
          labelWordRange: [2, 3],
        },
      ],
      tripwires: [{ id: "tw_conflict", mustNotClaim: "conflict" }],
    });
    const proposal = baseProposal([
      {
        id: "claim_unsupported",
        subjectEntityId: "ent_1",
        construct: { measure: "noise" },
        value: { kind: "text", textValue: "nowhere" },
        modality: "observed",
        evidenceRefs: [
          { id: "ev_bad", sourceDocumentId: docId, page: 1, quote: "grade", sourceType: "document" },
        ],
      },
      {
        id: "claim_value_wrong",
        subjectEntityId: "ent_1",
        construct: { measure: "dob" },
        value: { kind: "date", dateValue: "1999-01-01" },
        modality: "observed",
        evidenceRefs: [
          { id: "ev_dob", sourceDocumentId: docId, page: 1, quote: "2017-04-18", sourceType: "document" },
        ],
      },
      {
        id: "claim_on_gap",
        subjectEntityId: "ent_1",
        construct: { measure: "grade" },
        value: { kind: "code", codeValue: "2" },
        modality: "observed",
        evidenceRefs: [{ id: "ev_grade", sourceDocumentId: docId, page: 1, quote: "2", sourceType: "document" }],
      },
      {
        id: "claim_invariant",
        subjectEntityId: "ent_1",
        construct: { measure: "empty" },
        value: { kind: "text", textValue: "x" },
        modality: "observed",
        evidenceRefs: [],
      },
    ]);
    proposal.conflicts = [{ id: "conflict_any", claimIds: ["claim_value_wrong", "claim_on_gap"], kind: "other" }];
    const kinds = new Set(gradeGoldenProposal({ golden, proposal, corpus: ctx }).failures.map((f) => f.kind));
    expect(kinds.has("MISSED_FACT")).toBe(true);
    expect(kinds.has("UNSUPPORTED_CLAIM")).toBe(true);
    expect(kinds.has("VALUE_MISMATCH")).toBe(true);
    expect(kinds.has("WRONG_ABSTENTION")).toBe(true);
    expect(kinds.has("TRIPWIRE_FIRED")).toBe(true);
    expect(kinds.has("INVARIANT_BROKEN")).toBe(true);
  });

  it("D. tripwire score zero", () => {
    const golden = certifiedGolden({
      caseId: "tw",
      split: "tune",
      corpusDir: "x",
      facts: [],
      gaps: [],
      tripwires: [{ id: "tw1", mustNotClaim: "conflict" }],
    });
    const proposal = baseProposal([]);
    proposal.conflicts = [{ id: "c1", claimIds: [], kind: "other" }];
    expect(gradeGoldenProposal({ golden, proposal, corpus: ctx }).score).toBe(0);
  });

  it("E. word-range overlap match", () => {
    const golden = certifiedGolden({
      caseId: "overlap",
      split: "tune",
      corpusDir: "x",
      facts: [goldenFact({ id: "f1", wordRange: [0, 2], value: { kind: "date", dateValue: "2017-04-18" } })],
      gaps: [],
      tripwires: [],
    });
    const proposal = baseProposal([
      {
        id: "c1",
        subjectEntityId: "ent_1",
        construct: { measure: "dob" },
        value: { kind: "date", dateValue: "2017-04-18" },
        modality: "observed",
        evidenceRefs: [
          { id: "ev1", sourceDocumentId: docId, page: 1, quote: "2017-04-18", sourceType: "document" },
        ],
      },
    ]);
    const result = gradeGoldenProposal({ golden, proposal, corpus: ctx });
    expect(result.metrics.recall).toBe(1);
    expect(result.failures.some((f) => f.kind === "MISSED_FACT")).toBe(false);
  });

  it("F. non-overlapping provenance does not match", () => {
    const golden = certifiedGolden({
      caseId: "no_overlap",
      split: "tune",
      corpusDir: "x",
      facts: [goldenFact({ id: "f1", wordRange: [0, 1], value: { kind: "date", dateValue: "2017-04-18" } })],
      gaps: [],
      tripwires: [],
    });
    const proposal = baseProposal([
      {
        id: "c1",
        subjectEntityId: "ent_1",
        construct: { measure: "dob" },
        value: { kind: "date", dateValue: "2017-04-18" },
        modality: "observed",
        evidenceRefs: [{ id: "ev1", sourceDocumentId: docId, page: 1, quote: "extra", sourceType: "document" }],
      },
    ]);
    const result = gradeGoldenProposal({ golden, proposal, corpus: ctx });
    expect(result.metrics.recall).toBe(0);
    expect(result.failures.some((f) => f.kind === "MISSED_FACT")).toBe(true);
    expect(result.failures.some((f) => f.kind === "UNSUPPORTED_CLAIM")).toBe(true);
  });

  it("G. VALUE_MISMATCH", () => {
    const golden = certifiedGolden({
      caseId: "vm",
      split: "tune",
      corpusDir: "x",
      facts: [goldenFact({ id: "f1", wordRange: [0, 1], value: { kind: "date", dateValue: "2017-04-18" } })],
      gaps: [],
      tripwires: [],
    });
    const proposal = baseProposal([
      {
        id: "c1",
        subjectEntityId: "ent_1",
        construct: { measure: "dob" },
        value: { kind: "date", dateValue: "2000-01-01" },
        modality: "observed",
        evidenceRefs: [
          { id: "ev1", sourceDocumentId: docId, page: 1, quote: "2017-04-18", sourceType: "document" },
        ],
      },
    ]);
    expect(gradeGoldenProposal({ golden, proposal, corpus: ctx }).failures.some((f) => f.kind === "VALUE_MISMATCH")).toBe(
      true,
    );
  });

  it("H. entity_ref uses entityId", () => {
    expect(claimValuesEquivalent({ kind: "entity_ref", entityId: "a" }, { kind: "entity_ref", entityId: "a" })).toBe(
      true,
    );
    expect(claimValuesEquivalent({ kind: "entity_ref", entityId: "a" }, { kind: "entity_ref", entityId: "b" })).toBe(
      false,
    );
  });

  it("I. quantity number + unit", () => {
    expect(
      claimValuesEquivalent(
        { kind: "quantity", numberValue: 62, unit: "wcpm" },
        { kind: "quantity", numberValue: 62, unit: "wcpm" },
      ),
    ).toBe(true);
    expect(
      claimValuesEquivalent(
        { kind: "quantity", numberValue: 62, unit: "wcpm" },
        { kind: "quantity", numberValue: 62, unit: null },
      ),
    ).toBe(false);
  });

  it("J. bad modality => MISSED_FACT + UNSUPPORTED_CLAIM", () => {
    const golden = certifiedGolden({
      caseId: "mod",
      split: "tune",
      corpusDir: "x",
      facts: [
        goldenFact({
          id: "f1",
          wordRange: [0, 1],
          value: { kind: "date", dateValue: "2017-04-18" },
          acceptableModalities: ["planned"],
        }),
      ],
      gaps: [],
      tripwires: [],
    });
    const proposal = baseProposal([
      {
        id: "c1",
        subjectEntityId: "ent_1",
        construct: { measure: "dob" },
        value: { kind: "date", dateValue: "2017-04-18" },
        modality: "observed",
        evidenceRefs: [
          { id: "ev1", sourceDocumentId: docId, page: 1, quote: "2017-04-18", sourceType: "document" },
        ],
      },
    ]);
    const result = gradeGoldenProposal({ golden, proposal, corpus: ctx });
    expect(result.failures.some((f) => f.kind === "MISSED_FACT")).toBe(true);
    expect(result.failures.some((f) => f.kind === "UNSUPPORTED_CLAIM" && f.claimId === "c1")).toBe(true);
  });

  it("K. refuses draft golden", () => {
    const golden = {
      caseId: "draft",
      split: "tune" as const,
      corpusDir: "x",
      facts: [],
      gaps: [],
      tripwires: [],
      verifiedBy: null,
      draft: true as const,
    };
    expect(() => gradeGoldenProposal({ golden, proposal: baseProposal([]), corpus: ctx })).toThrow(
      GoldenNotCertifiedError,
    );
    expect(() => assertCertifiedGolden(golden as GoldenCase)).toThrow(GoldenNotCertifiedError);
  });

  it("L. feedback max 5 examples", () => {
    const golden = certifiedGolden({
      caseId: "fb",
      split: "tune",
      corpusDir: "x",
      facts: Array.from({ length: 8 }, (_, i) =>
        goldenFact({ id: `fact_${i}`, wordRange: [3, 4], value: { kind: "text", textValue: `v${i}` } }),
      ),
      gaps: [],
      tripwires: [],
    });
    const missed = gradeGoldenProposal({ golden, proposal: baseProposal([]), corpus: ctx }).feedback.find(
      (f) => f.kind === "MISSED_FACT",
    );
    expect(missed?.count).toBe(8);
    expect(missed?.examples.length).toBeLessThanOrEqual(5);
  });

  it("M. deterministic failure ordering", () => {
    const golden = certifiedGolden({
      caseId: "order",
      split: "tune",
      corpusDir: "x",
      facts: [
        goldenFact({ id: "b_fact", wordRange: [3, 4], value: { kind: "text", textValue: "x" } }),
        goldenFact({ id: "a_fact", wordRange: [3, 4], value: { kind: "text", textValue: "y" } }),
      ],
      gaps: [],
      tripwires: [],
    });
    const result = gradeGoldenProposal({ golden, proposal: baseProposal([]), corpus: ctx });
    expect(result.failures[0]?.goldenFactId).toBe("a_fact");
  });

  describe("golden gap matching", () => {
    const docId = "doc.pdf";
    const page = pageModelFromWords(docId, 1, ["2017-04-18", "grade", "2", "extra"]);
    const ctx = corpus(docId, page, minimalRecoveredPage(1, docId));

    it("N. same gap different candidate id matches abstention", () => {
      const golden = certifiedGolden({
        caseId: "gap_id_diff",
        split: "tune",
        corpusDir: "x",
        facts: [],
        gaps: [{ id: "golden_gap_stable", gapKind: "not_found_in_supplied_documents", description: "parent input missing" }],
        tripwires: [],
      });
      const proposal = baseProposal([]);
      proposal.missingInformation = [
        {
          id: "model_generated_uuid_99",
          description: "parent input missing",
          gapKind: "not_found_in_supplied_documents",
          proposalLineage: { proposalItemId: "model_generated_uuid_99", studyRunId: "sr" },
        },
      ];
      const result = gradeGoldenProposal({ golden, proposal, corpus: ctx });
      expect(result.metrics.abstention).toBe(1);
      expect(result.failures.some((f) => f.kind === "WRONG_ABSTENTION")).toBe(false);
    });

    it("O. same golden id wrong gapKind does not match", () => {
      const golden = certifiedGolden({
        caseId: "gap_kind_mismatch",
        split: "tune",
        corpusDir: "x",
        facts: [],
        gaps: [{ id: "g1", gapKind: "not_found_in_supplied_documents", description: "x" }],
        tripwires: [],
      });
      const proposal = baseProposal([]);
      proposal.missingInformation = [
        {
          id: "g1",
          description: "x",
          gapKind: "field_present_but_empty",
          proposalLineage: { proposalItemId: "g1", studyRunId: "sr" },
        },
      ];
      const result = gradeGoldenProposal({ golden, proposal, corpus: ctx });
      expect(result.metrics.abstention).toBe(0);
      expect(result.failures.some((f) => f.kind === "WRONG_ABSTENTION" && f.gapId === "g1")).toBe(true);
    });

    it("P. anchored gap requires evidence word-range overlap", () => {
      const golden = certifiedGolden({
        caseId: "gap_anchor_ok",
        split: "tune",
        corpusDir: "x",
        facts: [],
        gaps: [
          {
            id: "gap_anchor",
            gapKind: "not_found_in_supplied_documents",
            description: "label region",
            labelWordRange: [2, 3],
          },
        ],
        tripwires: [],
      });
      const proposal = baseProposal([]);
      proposal.missingInformation = [
        {
          id: "mi_1",
          description: "different prose",
          gapKind: "not_found_in_supplied_documents",
          evidenceRefs: [
            { id: "ev", sourceDocumentId: docId, page: 1, quote: "2", sourceType: "document" },
          ],
          proposalLineage: { proposalItemId: "mi_1", studyRunId: "sr" },
        },
      ];
      expect(gradeGoldenProposal({ golden, proposal, corpus: ctx }).metrics.abstention).toBe(1);
    });

    it("Q. non-overlapping missingInformation does not satisfy anchored golden gap", () => {
      const golden = certifiedGolden({
        caseId: "gap_anchor_miss",
        split: "tune",
        corpusDir: "x",
        facts: [],
        gaps: [
          {
            id: "gap_anchor",
            gapKind: "not_found_in_supplied_documents",
            description: "label region",
            labelWordRange: [2, 3],
          },
        ],
        tripwires: [],
      });
      const proposal = baseProposal([]);
      proposal.missingInformation = [
        {
          id: "mi_1",
          description: "label region",
          gapKind: "not_found_in_supplied_documents",
          evidenceRefs: [
            { id: "ev", sourceDocumentId: docId, page: 1, quote: "2017-04-18", sourceType: "document" },
          ],
          proposalLineage: { proposalItemId: "mi_1", studyRunId: "sr" },
        },
      ];
      const result = gradeGoldenProposal({ golden, proposal, corpus: ctx });
      expect(result.metrics.abstention).toBe(0);
      expect(result.failures.some((f) => f.kind === "WRONG_ABSTENTION")).toBe(true);
    });

    it("R. L001 certified parent-input gap matches without shared ids", () => {
      const raw = JSON.parse(
        readFileSync(join(repoRoot, "engine/eval/golden/tune/l001.json"), "utf8"),
      ) as unknown;
      const validated = validateGoldenCase(raw);
      expect(validated.ok).toBe(true);
      if (!validated.ok) {
        return;
      }
      assertCertifiedGolden(validated.value);
      const goldenGap = validated.value.gaps[0];
      expect(goldenGap).toBeDefined();
      if (!goldenGap) return;
      const proposal = baseProposal([]);
      proposal.missingInformation = [
        {
          id: "run_mi_001",
          description: goldenGap.description,
          gapKind: goldenGap.gapKind,
          proposalLineage: { proposalItemId: "run_mi_001", studyRunId: "sr" },
        },
      ];
      const result = gradeGoldenProposal({
        golden: validated.value,
        proposal,
        corpus: { pageModelsByDocumentId: new Map(), recoveredPagesByDocumentId: new Map() },
      });
      expect(result.metrics.abstention).toBe(1);
    });
  });

  describe("precision zero-denominator", () => {
    it("zero candidate claims with golden facts => precision 0", () => {
      const golden = certifiedGolden({
        caseId: "empty_vs_facts",
        split: "tune",
        corpusDir: "x",
        facts: [goldenFact({ id: "f1", wordRange: [0, 1], value: { kind: "text", textValue: "x" } })],
        gaps: [],
        tripwires: [],
      });
      const result = gradeGoldenProposal({ golden, proposal: baseProposal([]), corpus: ctx });
      expect(result.metrics.precision).toBe(0);
    });

    it("zero candidate claims and zero golden facts => precision 1", () => {
      const golden = certifiedGolden({
        caseId: "empty_vs_empty",
        split: "tune",
        corpusDir: "x",
        facts: [],
        gaps: [],
        tripwires: [],
      });
      const result = gradeGoldenProposal({ golden, proposal: baseProposal([]), corpus: ctx });
      expect(result.metrics.precision).toBe(1);
    });

    it("L001-like empty candidate does not get 0.5 score from precision alone", () => {
      const raw = JSON.parse(readFileSync(join(repoRoot, "engine/eval/golden/tune/l001.json"), "utf8")) as unknown;
      const validated = validateGoldenCase(raw);
      expect(validated.ok).toBe(true);
      if (!validated.ok) {
        return;
      }
      assertCertifiedGolden(validated.value);
      const result = gradeGoldenProposal({
        golden: validated.value,
        proposal: baseProposal([]),
        corpus: { pageModelsByDocumentId: new Map(), recoveredPagesByDocumentId: new Map() },
      });
      expect(result.metrics.precision).toBe(0);
      expect(result.metrics.recall).toBe(0);
      expect(result.score).not.toBe(0.5);
      expect(result.score).toBe(0);
    });
  });
});
