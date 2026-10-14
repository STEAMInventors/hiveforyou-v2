import type { CanonicalStudyArtifact } from "@hiveforyou/shared/canonical-study-artifact";

export type L001TimelineCheckResult = {
  id: string;
  pass: boolean;
  observed: string;
  expected: string;
};

const L001_DATED_SEQUENCE: Array<{ eventId: string; date: string }> = [
  { eventId: "referral", date: "2024-08-20" },
  { eventId: "evaluation_plan", date: "2024-08-28" },
  { eventId: "consent", date: "2024-09-04" },
  { eventId: "evaluation_psychoeducational", date: "2024-10-15" },
  { eventId: "evaluation_academic", date: "2024-10-18" },
  { eventId: "evaluation_speech_language", date: "2024-10-22" },
  { eventId: "eligibility", date: "2024-11-01" },
  { eventId: "initial_iep", date: "2024-11-12" },
];

/** IEP L001 timeline qualification — domain assertions only; not imported by Hive Core. */
export function evaluateL001TimelineAcceptance(artifact: CanonicalStudyArtifact): L001TimelineCheckResult[] {
  const checks: L001TimelineCheckResult[] = [];
  const workflowEventIds = new Set(L001_DATED_SEQUENCE.map((row) => row.eventId));
  const dated = (artifact.timeline?.dated ?? []).filter((entry) => workflowEventIds.has(entry.eventId));

  const observedSequence = dated.map((entry) => `${entry.eventId}@${entry.sortDate}`).join(" -> ");
  const expectedSequence = L001_DATED_SEQUENCE.map((row) => `${row.eventId}@${row.date}`).join(" -> ");

  checks.push({
    id: "dated_sequence_order",
    pass: observedSequence === expectedSequence,
    observed: observedSequence || "(empty)",
    expected: expectedSequence,
  });

  for (const expected of L001_DATED_SEQUENCE) {
    const entry = dated.find((row) => row.eventId === expected.eventId);
    checks.push({
      id: `event_${expected.eventId}_date`,
      pass: entry?.sortDate === expected.date && (entry.eventEvidence?.length ?? 0) > 0,
      observed: `${entry?.sortDate ?? "missing"} evidence=${entry?.eventEvidence?.length ?? 0}`,
      expected: `${expected.date} with eventEvidence`,
    });
    checks.push({
      id: `event_${expected.eventId}_date_evidence`,
      pass: (entry?.dateEvidence?.length ?? 0) > 0,
      observed: `dateEvidence=${entry?.dateEvidence?.length ?? 0}`,
      expected: "dateEvidence>=1",
    });
  }

  return checks;
}
