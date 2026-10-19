import { loadDiscoverPrompt } from "../../prompts/load-discover-prompt.js";
import { composeDiscoverPromptInputsFromMappingPack } from "./compose-discover-prompt-from-mapping-pack.js";
import { qualificationProposalForCase, qualificationSourcesForCase } from "./qualification-fixtures.js";
import { resolveDiscoverMappingPackContextForQualificationCase } from "./resolve-discover-mapping-pack-context.js";
import { validateDiscoveryProposalWithMappingPack } from "./validate-discovery-proposal-mapping-pack.js";
import type { DiscoverPackComplianceResult } from "./types.js";

export type DiscoverQualificationCaseResult = {
  caseId: string;
  packPin: DiscoverPackComplianceResult["packPin"];
  validationOk: boolean;
  compliance: DiscoverPackComplianceResult;
  promptPinDigest: string;
  promptSchemaVersion: string;
};

export function runDiscoverQualificationCase(caseId: string): DiscoverQualificationCaseResult {
  const context = resolveDiscoverMappingPackContextForQualificationCase(caseId);
  const sources = qualificationSourcesForCase(caseId);
  const proposal = qualificationProposalForCase(caseId);
  const prompt = loadDiscoverPrompt("discover-v2");
  const composed = composeDiscoverPromptInputsFromMappingPack(prompt, sources, context);

  if (composed.mappingPackPin.contentDigest !== context.pin.contentDigest) {
    throw new Error("Prompt mapping pack digest mismatch vs resolver");
  }

  const { validation, compliance } = validateDiscoveryProposalWithMappingPack(
    proposal,
    sources,
    context,
  );

  if (compliance.packPin.contentDigest !== context.pin.contentDigest) {
    throw new Error("Compliance report digest mismatch vs resolver");
  }

  return {
    caseId,
    packPin: context.pin,
    validationOk: validation.ok,
    compliance,
    promptPinDigest: composed.mappingPackPin.contentDigest,
    promptSchemaVersion: composed.mappingPackDiscoverViewSchemaVersion,
  };
}

export function printDiscoverQualificationReport(result: DiscoverQualificationCaseResult) {
  console.log(`\n=== Discover qualification (${result.caseId}) ===`);
  console.log(`packId=${result.packPin.packId}`);
  console.log(`packVersion=${result.packPin.packVersion}`);
  console.log(`contentDigest=${result.packPin.contentDigest}`);
  console.log(`selection=${result.packPin.selection}`);
  console.log(`promptSchemaVersion=${result.promptSchemaVersion}`);
  console.log(`validation=${result.validationOk ? "PASS" : "FAIL"}`);
  console.log(`documentTypesInPack=${result.compliance.definitionsApplied.documentTypes.length}`);
  for (const row of result.compliance.classifications) {
    console.log(
      `  ${row.disposition}: ${row.proposedDocumentType} (${row.sourceDocumentId} p${row.pageStart}${row.pageEnd ? `-${row.pageEnd}` : ""})`,
    );
  }
  if (!result.validationOk) {
    for (const issue of result.compliance.validation.issues) {
      console.log(`  issue: ${issue.code} — ${issue.message}`);
    }
  }
}
