import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { GradeCorpusContext, GradeResult } from "../grade.js";
import { baselineCaseIdForGolden } from "./baseline-case-id.js";
import { proposalFromStudyBaseline } from "./baseline-proposal.js";
import type { StudyBaseline } from "./baseline-types.js";
import { sourceIdToPdfFilename } from "./load-grade-corpus.js";
import { renderEvalReport, stripGeneratedLine } from "./report.js";
import { listGoldensForSplit } from "./select-goldens.js";
import { parseEvalSource, runEvalForSource } from "./run-eval.js";

describe("eval CLI helpers", () => {
  it("parseEvalSource accepts baselines/v4 and v4.1", () => {
    expect(parseEvalSource("baselines/v4")).toEqual({ label: "baselines/v4", promptVersion: "v4" });
    expect(parseEvalSource("baselines/v4.1")).toEqual({ label: "baselines/v4.1", promptVersion: "v4.1" });
  });

  it("caleb9 baseline maps to l002 golden only in loader layer", () => {
    expect(baselineCaseIdForGolden("l002")).toBe("caleb9");
    expect(baselineCaseIdForGolden("l001")).toBe("l001");
  });

  it("sourceIdToPdf maps caleb9 UUIDs to l002 pdf filenames by filename", () => {
    const baselineManifest = {
      files: [
        {
          filename: "01_prior_eligibility_determination.pdf",
          sha256: "ed37598ba612bdfdb5b3f9af3f49008519a2a9879bd5b7054ea6e43e5c9cae2e",
          sourceDocumentId: "d37f2730-ae42-4ae4-93e3-dfa8f11f5591",
        },
      ],
    };
    const corpusManifest = {
      sourceIdPrefix: "l002-src",
      files: [
        {
          filename: "01_prior_eligibility_determination.pdf",
          sha256: "ed37598ba612bdfdb5b3f9af3f49008519a2a9879bd5b7054ea6e43e5c9cae2e",
          sourceDocumentId: "l002-src-1",
        },
      ],
    };
    const map = sourceIdToPdfFilename({
      baselineManifest,
      corpusManifest,
      baselineCaseId: "caleb9",
      corpusCaseId: "l002",
    });
    expect(map.get("d37f2730-ae42-4ae4-93e3-dfa8f11f5591")).toBe("01_prior_eligibility_determination.pdf");
  });

  it("skips draft goldens", () => {
    const root = mkdtempSync(join(tmpdir(), "eval-golden-"));
    const tuneDir = join(root, "golden", "tune");
    mkdirSync(tuneDir, { recursive: true });
    writeFileSync(
      join(tuneDir, "draftcase.json"),
      JSON.stringify({
        caseId: "draftcase",
        split: "tune",
        corpusDir: "engine/intake/fixtures/l001",
        verifiedBy: null,
        draft: true,
        facts: [],
        gaps: [],
        tripwires: [],
      }),
    );
    const { goldens, skipped } = listGoldensForSplit({ evalRoot: root, split: "tune" });
    expect(goldens).toHaveLength(0);
    expect(skipped.some((s) => s.reason === "draft")).toBe(true);
  });

  it("report includes metrics and deterministic body except Generated", () => {
    const grade: GradeResult = {
      score: 0.5,
      metrics: { precision: 1, recall: 0.5, abstention: 0, provenance: 1, invariants: 1 },
      failures: [
        {
          kind: "MISSED_FACT",
          goldenFactId: "f1",
          message: "Golden fact f1 has no acceptable candidate match (overlap, value, modality).",
          expectedPage: 1,
        },
      ],
      feedback: [
        {
          kind: "MISSED_FACT",
          count: 1,
          examples: [{ message: "Golden fact f1 has no acceptable candidate match (overlap, value, modality)." }],
        },
      ],
    };
    const body = renderEvalReport({
      source: "baselines/v4",
      split: "tune",
      generatedIso: "2026-10-08T12:00:00.000Z",
      casesScored: [
        {
          caseId: "l001",
          grade,
          baselinePath: "engine/eval/baselines/l001-v4.json",
          acceptedClaimCount: 0,
        },
      ],
      skipped: [],
      baselineNote: "note",
    });
    expect(body).toContain("MISSED_FACT");
    expect(body).toContain("mean score: 0.5000");
    const a = stripGeneratedLine(body.replace("2026-10-08T12:00:00.000Z", "TS1"));
    const b = stripGeneratedLine(body.replace("2026-10-08T12:00:00.000Z", "TS2"));
    expect(a).toBe(b);
  });

  it("proposalFromStudyBaseline maps role and v3 values to v4", () => {
    const baseline: StudyBaseline = {
      schemaVersion: "hive-study-baseline/1",
      caseId: "l001",
      promptVersion: "v4",
      acceptedClaims: [
        {
          id: "c1",
          subjectEntityId: "ent1",
          construct: "date_of_birth|-|-",
          role: "observed",
          value: { kind: "date", value: "2017-04-18" },
          evidenceRefs: [
            {
              id: "ev1",
              sourceDocumentId: "l001-src-1",
              page: 1,
              snippet: "Date of Birth: 2017-04-18",
              sourceType: "document",
            },
          ],
        },
      ],
    };
    const proposal = proposalFromStudyBaseline(baseline);
    expect(proposal.claims[0]?.modality).toBe("observed");
    expect(proposal.claims[0]?.value).toEqual({ kind: "date", dateValue: "2017-04-18" });
  });

  it("runEvalForSource skips missing baseline without mutating golden files", async () => {
    const root = mkdtempSync(join(tmpdir(), "eval-run-"));
    const tuneDir = join(root, "golden", "tune");
    mkdirSync(tuneDir, { recursive: true });
    const goldenPath = join(tuneDir, "l999.json");
    const golden = {
      caseId: "l999",
      split: "tune",
      corpusDir: "engine/intake/fixtures/l001",
      verifiedBy: "Reviewer",
      draft: false,
      facts: [],
      gaps: [],
      tripwires: [],
    };
    writeFileSync(goldenPath, JSON.stringify(golden));
    const before = readFileSync(goldenPath, "utf8");

    const emptyCorpus = vi.fn(async (): Promise<GradeCorpusContext> => ({
      pageModelsByDocumentId: new Map(),
      recoveredPagesByDocumentId: new Map(),
    }));

    const summary = await runEvalForSource({
      repoRoot: root,
      evalRoot: root,
      split: "tune",
      source: { label: "baselines/v4", promptVersion: "v4" },
      generatedIso: "2026-10-08T00:00:00.000Z",
      loadCorpus: emptyCorpus,
    });
    expect(summary.casesScored).toHaveLength(0);
    expect(summary.skipped.some((s) => s.reason === "no_matching_baseline")).toBe(true);
    expect(readFileSync(goldenPath, "utf8")).toBe(before);
    expect(emptyCorpus).not.toHaveBeenCalled();
  });
});
