import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { GradeCorpusContext } from "../grade.js";
import type { GoldenCase } from "../golden/types.js";
import {
  gradeStudyRunAgainstGolden,
  loadAcceptedFactsFromResolvedPath,
  loadReaderAcceptedFactsForStudyRun,
} from "./golden-comparison.js";

const golden: GoldenCase = {
  caseId: "l001",
  split: "tune",
  corpusDir: "engine/intake/fixtures/l001",
  verifiedBy: "test",
  facts: [],
  gaps: [],
  tripwires: [],
};

const corpus: GradeCorpusContext = {
  pageModelsByDocumentId: new Map(),
  recoveredPagesByDocumentId: new Map(),
};

describe("golden-comparison artifact grading", () => {
  it("grades from reader-accepted-facts/1 file without model calls", () => {
    const dir = mkdtempSync(join(tmpdir(), "reader-accepted-"));
    const path = join(dir, "run-1.json");
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: "reader-accepted-facts/1",
        studyRunId: "run-1",
        attemptId: "attempt-1",
        caseId: "case-1",
        readerArchitectureVariant: "case_wide",
        promptSha256: "a".repeat(64),
        createdAt: "2026-10-10T00:00:00.000Z",
        facts: [],
      }),
    );

    const loaded = loadAcceptedFactsFromResolvedPath(path);
    const graded = gradeStudyRunAgainstGolden({
      golden,
      corpus,
      studyRunId: "run-1",
      traceEvents: [
        {
          event_type: "STARTED",
          event_payload: {},
          attempt_id: "attempt-1",
          sequence_number: 0,
        },
        {
          event_type: "EVIDENCE_ACCEPTED",
          event_payload: {},
          attempt_id: "attempt-1",
          sequence_number: 1,
        },
        {
          event_type: "COMPLETED",
          event_payload: { acceptedFactCount: 0 },
          attempt_id: "attempt-1",
          sequence_number: 2,
        },
      ],
      accepted: loaded,
    });

    expect(loaded.artifact?.attemptId).toBe("attempt-1");
    expect(graded.gradeability.traceAudit?.attemptId).toBe("attempt-1");
    expect(graded.comparison).not.toBeNull();
  });

  it("returns empty load when no file or storage", async () => {
    const loaded = await loadReaderAcceptedFactsForStudyRun({
      repoRoot: process.cwd(),
      studyRunId: "missing-run",
      env: {},
    });
    expect(loaded.source).toBeNull();
    expect(loaded.facts).toEqual([]);
  });
});
