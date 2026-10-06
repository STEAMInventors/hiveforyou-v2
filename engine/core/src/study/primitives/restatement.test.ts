import { describe, expect, it } from "vitest";

import type { Statement } from "../../atoms/types";
import { restatementFindings } from "./restatement";

function stmt(id: string, subjectId: string, attributeRaw: string, value: string): Statement {
  return {
    id,
    documentId: "doc-a",
    tier: 1,
    subjectId,
    attributeRaw,
    attributeKey: null,
    valueRaw: value,
    valueNorm: value,
    unit: null,
    appliesFrom: null,
    appliesTo: null,
    conditionRaw: null,
    speakerId: null,
    sourceRefId: null,
    force: "observes",
    isEmpty: false,
    evidence: [
      {
        documentId: "doc-a",
        pageNumber: 1,
        blockId: "b1",
        cellId: null,
        wordRange: [1, 2],
        quote: value,
        bbox: [0, 0, 1, 1],
      },
    ],
  };
}

describe("restatementFindings", () => {
  it("emits a fact for a single-source statement group", () => {
    const findings = restatementFindings({
      statements: [stmt("s1", "party:maya", "Grade", "2")],
      partyMatches: [],
    });
    expect(findings.some((f) => f.kind === "fact")).toBe(true);
    expect(findings.find((f) => f.kind === "fact")!.statementIds).toEqual(["s1"]);
  });
});
