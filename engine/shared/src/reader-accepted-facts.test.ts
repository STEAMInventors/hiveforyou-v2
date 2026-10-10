import { describe, expect, it } from "vitest";

import { buildReaderAcceptedFactsArtifact, parseReaderAcceptedFactsArtifact } from "./reader-accepted-facts.js";

describe("reader-accepted-facts/1", () => {
  it("validates provenance fields", () => {
    const artifact = buildReaderAcceptedFactsArtifact({
      studyRunId: "run-1",
      attemptId: "attempt-1",
      caseId: "case-1",
      readerArchitectureVariant: "parallel_document",
      promptSha256: "b".repeat(64),
      createdAt: "2026-10-10T00:00:00.000Z",
      facts: [{ id: "fact-1" }],
    });
    expect(parseReaderAcceptedFactsArtifact(artifact).attemptId).toBe("attempt-1");
  });
});
