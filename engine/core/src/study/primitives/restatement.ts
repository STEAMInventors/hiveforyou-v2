import { normalizeAttributeRaw } from "../../atoms/normalize";
import { resolveSubjectMatchGrade, statementGroupKey, type EntityMatch } from "../../atoms/match";
import type { Statement } from "../../atoms/types";
import type { StudyFinding } from "./types";

let findingSeq = 0;

function nextFindingId(): string {
  findingSeq += 1;
  return `finding-restatement-${findingSeq}`;
}

function valuesEqual(a: Statement, b: Statement): boolean {
  const av = a.valueNorm ?? a.valueRaw;
  const bv = b.valueNorm ?? b.valueRaw;
  return String(av ?? "") === String(bv ?? "");
}

export function restatementFindings(input: {
  statements: Statement[];
  partyMatches: EntityMatch[];
}): StudyFinding[] {
  findingSeq = 0;
  const groups = new Map<string, Statement[]>();
  for (const statement of input.statements) {
    const key = statementGroupKey(statement);
    const bucket = groups.get(key) ?? [];
    bucket.push(statement);
    groups.set(key, bucket);
  }

  const findings: StudyFinding[] = [];
  for (const group of groups.values()) {
    if (group.length === 0) {
      continue;
    }
    const anchor = group[0]!;
    let grade: StudyFinding["grade"] = "A";
    for (const other of group.slice(1)) {
      const matchGrade = resolveSubjectMatchGrade(
        anchor.subjectId,
        other.subjectId,
        input.partyMatches,
      );
      if (matchGrade === "B") {
        grade = "B";
      }
    }

    const attributeKey = anchor.attributeKey;
    if (attributeKey) {
      const distinct = group.filter((s) => !valuesEqual(s, anchor));
      if (distinct.length > 0) {
        findings.push({
          id: nextFindingId(),
          kind: "conflict",
          basis: "restatement",
          grade,
          statementIds: group.map((s) => s.id),
          evidence: group.flatMap((s) => s.evidence),
          detail: `Conflicting values for ${attributeKey}`,
        });
        continue;
      }
    } else {
      const rawKey = normalizeAttributeRaw(anchor.attributeRaw);
      const allSameRaw = group.every(
        (s) => normalizeAttributeRaw(s.attributeRaw) === rawKey && valuesEqual(s, anchor),
      );
      if (!allSameRaw) {
        if (attributeKey) {
          findings.push({
            id: nextFindingId(),
            kind: "conflict",
            basis: "restatement",
            grade,
            statementIds: group.map((s) => s.id),
            evidence: group.flatMap((s) => s.evidence),
            detail: "Conflicting values for same attribute",
          });
        }
        continue;
      }
    }

    findings.push({
      id: nextFindingId(),
      kind: "fact",
      basis: "restatement",
      grade,
      statementIds: group.map((s) => s.id),
      evidence: group.flatMap((s) => s.evidence),
      detail:
        group.length > 1
          ? `Agreement across ${group.length} statements`
          : "Single-source statement",
    });
  }

  return findings;
}
