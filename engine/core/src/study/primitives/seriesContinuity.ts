import type { DocumentProfile } from "../../atoms/types";
import type { EntityMatch } from "../../atoms/match";
import type { StudyFinding } from "./types";

let findingSeq = 0;

function nextFindingId(): string {
  findingSeq += 1;
  return `finding-series-${findingSeq}`;
}

function parseIso(date: string | null): number | null {
  if (!date) {
    return null;
  }
  const t = Date.parse(date);
  return Number.isFinite(t) ? t : null;
}

export function seriesContinuityFindings(input: {
  profiles: DocumentProfile[];
  accountIdByDocument: Map<string, string>;
  partyMatches: EntityMatch[];
}): StudyFinding[] {
  findingSeq = 0;
  const findings: StudyFinding[] = [];
  const byAccount = new Map<string, DocumentProfile[]>();

  for (const profile of input.profiles) {
    const accountId = input.accountIdByDocument.get(profile.documentId);
    if (!accountId) {
      continue;
    }
    const bucket = byAccount.get(accountId) ?? [];
    bucket.push(profile);
    byAccount.set(accountId, bucket);
  }

  for (const [accountId, profiles] of byAccount.entries()) {
    const ordered = profiles
      .map((p) => ({
        profile: p,
        from: parseIso(p.periodFrom),
        to: parseIso(p.periodTo),
      }))
      .filter((row) => row.from != null && row.to != null)
      .sort((a, b) => (a.from! - b.from!));
    for (let i = 1; i < ordered.length; i += 1) {
      const prev = ordered[i - 1]!;
      const curr = ordered[i]!;
      if (curr.from! > prev.to! + 86_400_000) {
        findings.push({
          id: nextFindingId(),
          kind: "gap",
          basis: "seriesContinuity",
          grade: "A",
          statementIds: [],
          evidence: [],
          detail: `Period gap for account ${accountId} between ${prev.profile.periodTo} and ${curr.profile.periodFrom}`,
        });
      }
    }
  }

  return findings;
}
