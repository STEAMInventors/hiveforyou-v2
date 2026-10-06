import { normalizeAttributeRaw } from "./normalize";
import type { Party, Statement } from "./types";

export type MatchGrade = "A" | "B";

export type EntityMatch = {
  leftId: string;
  rightId: string;
  grade: MatchGrade;
};

const MASKED_SUFFIX = /xxxx(\d{4})$/i;

function digitRuns(text: string): string[] {
  return [...text.matchAll(/\d{4,}/g)].map((m) => m[0]!);
}

function maskedSuffixMatch(a: string, b: string): boolean {
  const ma = MASKED_SUFFIX.exec(a.trim());
  const mb = MASKED_SUFFIX.exec(b.trim());
  if (!ma || !mb) {
    return false;
  }
  return ma[1] === mb[1];
}

function gradeAIdMatch(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  const runsA = digitRuns(a);
  const runsB = digitRuns(b);
  if (runsA.some((run) => runsB.includes(run) && run.length >= 4)) {
    return true;
  }
  return maskedSuffixMatch(a, b);
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function matchParties(parties: Party[]): EntityMatch[] {
  const matches: EntityMatch[] = [];
  for (let i = 0; i < parties.length; i += 1) {
    for (let j = i + 1; j < parties.length; j += 1) {
      const a = parties[i]!;
      const b = parties[j]!;
      if (gradeAIdMatch(a.id, b.id) || gradeAIdMatch(a.nameRaw, b.nameRaw)) {
        matches.push({ leftId: a.id, rightId: b.id, grade: "A" });
        continue;
      }
      if (
        a.role &&
        b.role &&
        a.role === b.role &&
        normalizeName(a.nameNorm) === normalizeName(b.nameNorm)
      ) {
        matches.push({ leftId: a.id, rightId: b.id, grade: "B" });
      }
    }
  }
  return matches;
}

export function resolveSubjectMatchGrade(
  leftSubjectId: string,
  rightSubjectId: string,
  partyMatches: EntityMatch[],
): MatchGrade | null {
  if (leftSubjectId === rightSubjectId) {
    return "A";
  }
  const direct = partyMatches.find(
    (m) =>
      (m.leftId === leftSubjectId && m.rightId === rightSubjectId) ||
      (m.leftId === rightSubjectId && m.rightId === leftSubjectId),
  );
  return direct?.grade ?? null;
}

export function statementGroupKey(statement: Statement): string {
  const attribute =
    statement.attributeKey ?? normalizeAttributeRaw(statement.attributeRaw);
  return `${statement.subjectId}|${attribute}`;
}
