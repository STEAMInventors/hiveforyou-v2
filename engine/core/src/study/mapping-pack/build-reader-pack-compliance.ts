import type {
  ReaderCoverageGap,
  ReaderDocumentQualificationTrace,
  ReaderMappingPackContext,
  ReaderPackComplianceFactRow,
  ReaderPackComplianceResult,
} from "./types.js";

export function buildReaderPackCompliance(input: {
  context: ReaderMappingPackContext;
  documents: ReaderDocumentQualificationTrace[];
  facts: ReaderPackComplianceFactRow[];
  coverageGaps: ReaderCoverageGap[];
  unexpectedSourceSupported: ReaderPackComplianceFactRow[];
  issues: ReaderPackComplianceResult["issues"];
}): ReaderPackComplianceResult {
  const accepted = input.facts.filter((row) => row.disposition === "accepted").length;
  const rejected = input.facts.filter((row) => row.disposition === "rejected").length;
  const unresolved = input.facts.filter((row) => row.disposition === "unresolved").length;

  return {
    schemaVersion: "hive.reader-pack-compliance/1",
    packPin: input.context.pin,
    documents: input.documents,
    facts: input.facts,
    counts: {
      proposed: input.facts.length,
      accepted,
      rejected,
      unresolved,
    },
    coverageGaps: input.coverageGaps,
    unexpectedSourceSupported: input.unexpectedSourceSupported,
    validationOk: input.issues.length === 0 && rejected === 0,
    issues: input.issues,
  };
}
