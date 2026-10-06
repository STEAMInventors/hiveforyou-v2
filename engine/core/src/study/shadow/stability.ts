import { normalizeAttributeRaw } from "../../atoms/normalize";
import type { Statement } from "../../atoms/types";
import type { StudyFinding } from "../primitives/types";

export type StabilityIdentity = {
  documentId: string;
  subject: string;
  attribute: string;
  valueNorm: string;
  wordRange: string;
};

export function statementStabilityIdentity(statement: Statement): StabilityIdentity {
  const attribute = statement.attributeKey ?? normalizeAttributeRaw(statement.attributeRaw);
  const valueNorm =
    statement.valueNorm === null || statement.valueNorm === undefined
      ? "null"
      : String(statement.valueNorm);
  const wordRange = statement.evidence[0]?.wordRange.join(":") ?? "";
  return {
    documentId: statement.documentId,
    subject: statement.subjectId,
    attribute,
    valueNorm,
    wordRange,
  };
}

export function findingStabilityIdentity(finding: StudyFinding): string {
  const evidence = finding.evidence[0]?.wordRange.join(":") ?? "";
  return `${finding.kind}|${finding.basis}|${finding.detail}|${evidence}`;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

export function computeStability(input: {
  tier0A: Statement[];
  tier0B: Statement[];
  statementsA: Statement[];
  statementsB: Statement[];
  findingsA: StudyFinding[];
  findingsB: StudyFinding[];
}): {
  tier0IdenticalShare: number;
  statementExactMatchShare: number;
  statementJaccard: number;
  findingExactMatchShare: number;
  findingJaccard: number;
} {
  const tier0KeysA = input.tier0A.map((s) => JSON.stringify(statementStabilityIdentity(s)));
  const tier0KeysB = input.tier0B.map((s) => JSON.stringify(statementStabilityIdentity(s)));
  const tier0IdenticalShare =
    tier0KeysA.length === tier0KeysB.length &&
    tier0KeysA.every((key, index) => key === tier0KeysB[index])
      ? 1
      : 0;

  const stmtA = new Set(input.statementsA.map((s) => JSON.stringify(statementStabilityIdentity(s))));
  const stmtB = new Set(input.statementsB.map((s) => JSON.stringify(statementStabilityIdentity(s))));
  let stmtExact = 0;
  for (const key of stmtA) {
    if (stmtB.has(key)) {
      stmtExact += 1;
    }
  }
  const statementExactMatchShare = stmtA.size === 0 ? 1 : stmtExact / stmtA.size;

  const findA = new Set(input.findingsA.map(findingStabilityIdentity));
  const findB = new Set(input.findingsB.map(findingStabilityIdentity));
  let findExact = 0;
  for (const key of findA) {
    if (findB.has(key)) {
      findExact += 1;
    }
  }
  const findingExactMatchShare = findA.size === 0 ? 1 : findExact / findA.size;

  return {
    tier0IdenticalShare,
    statementExactMatchShare,
    statementJaccard: jaccard(stmtA, stmtB),
    findingExactMatchShare,
    findingJaccard: jaccard(findA, findB),
  };
}
