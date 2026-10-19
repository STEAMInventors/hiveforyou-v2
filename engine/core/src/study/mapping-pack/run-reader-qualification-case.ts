import { resolveDiscoverMappingPackContextForQualificationCase } from "../../discover/mapping-pack/resolve-discover-mapping-pack-context.js";
import { resolveReaderMappingPackContextForQualificationCase } from "./resolve-reader-mapping-pack-context.js";
import type { ReaderPackComplianceResult } from "./types.js";
import {
  resolveResolvedPackForQualificationCase,
  validateReaderExtractionWithMappingPack,
} from "./validate-reader-extraction-mapping-pack.js";

export type ReaderQualificationCaseResult = {
  caseId: string;
  packPin: ReaderPackComplianceResult["packPin"];
  validationOk: boolean;
  compliance: ReaderPackComplianceResult;
  discoverPinDigest: string;
  readerViewSchemaVersion: string;
};

export function runReaderQualificationCase(
  caseId: string,
  options?: { replayVariant?: "valid" | "invalid_evidence" },
): ReaderQualificationCaseResult {
  const context = resolveReaderMappingPackContextForQualificationCase(caseId);
  const discoverContext = resolveDiscoverMappingPackContextForQualificationCase(caseId);

  if (discoverContext.pin.contentDigest !== context.pin.contentDigest) {
    throw new Error("Reader mapping pack digest mismatch vs Discover qualification resolver");
  }

  const resolvedPack = resolveResolvedPackForQualificationCase(caseId, context);
  const { compliance } = validateReaderExtractionWithMappingPack({
    caseId,
    context,
    resolvedPack,
    replayVariant: options?.replayVariant,
  });

  if (compliance.packPin.contentDigest !== context.pin.contentDigest) {
    throw new Error("Compliance report digest mismatch vs resolver");
  }

  return {
    caseId,
    packPin: context.pin,
    validationOk: compliance.validationOk,
    compliance,
    discoverPinDigest: discoverContext.pin.contentDigest,
    readerViewSchemaVersion: context.readerView.schemaVersion,
  };
}

export function printReaderQualificationReport(result: ReaderQualificationCaseResult) {
  console.log(`\n=== Reader qualification (${result.caseId}) ===`);
  console.log(`packId=${result.packPin.packId}`);
  console.log(`packVersion=${result.packPin.packVersion}`);
  console.log(`contentDigest=${result.packPin.contentDigest}`);
  console.log(`selection=${result.packPin.selection}`);
  console.log(`readerViewSchema=${result.readerViewSchemaVersion}`);
  console.log(`discoverDigestMatch=${result.discoverPinDigest === result.packPin.contentDigest}`);
  console.log(`validation=${result.validationOk ? "PASS" : "FAIL"}`);
  console.log(
    `facts proposed=${result.compliance.counts.proposed} accepted=${result.compliance.counts.accepted} rejected=${result.compliance.counts.rejected} unresolved=${result.compliance.counts.unresolved}`,
  );
  for (const doc of result.compliance.documents) {
    console.log(
      `  doc ${doc.logicalDocumentId}: type=${doc.discoverDocumentTypeLabel} -> ${doc.resolvedDocumentTypeId} mappings=${doc.conceptMappingsApplied.length}`,
    );
  }
  for (const fact of result.compliance.facts) {
    console.log(
      `  ${fact.disposition}: ${fact.fieldId} (${fact.sourceDocumentId} p${fact.evidence?.page ?? "?"})`,
    );
  }
  if (result.compliance.coverageGaps.length > 0) {
    console.log(`  coverageGaps=${result.compliance.coverageGaps.length} (informational)`);
  }
  if (!result.validationOk) {
    for (const issue of result.compliance.issues) {
      console.log(`  issue: ${issue.code} — ${issue.message}`);
    }
  }
}
