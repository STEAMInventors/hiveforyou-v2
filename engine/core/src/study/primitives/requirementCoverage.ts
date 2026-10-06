import type { DocumentProfile } from "../../atoms/types";
import type { StudyFinding } from "./types";

let findingSeq = 0;

function nextFindingId(): string {
  findingSeq += 1;
  return `finding-req-${findingSeq}`;
}

export function requirementCoverageFindings(input: {
  profiles: DocumentProfile[];
}): StudyFinding[] {
  findingSeq = 0;
  const kinds = new Set(
    input.profiles.map((p) => p.kind).filter((k): k is string => Boolean(k)),
  );
  const findings: StudyFinding[] = [];

  for (const profile of input.profiles) {
    for (const request of profile.requests) {
      const impliedKind = request.text.toLowerCase().includes("evaluation")
        ? "evaluation"
        : null;
      if (impliedKind && !kinds.has(impliedKind)) {
        findings.push({
          id: nextFindingId(),
          kind: "gap",
          basis: "requirementCoverage",
          grade: null,
          statementIds: [],
          evidence: request.evidence,
          detail: request.text,
        });
      }
    }
  }

  return findings;
}
