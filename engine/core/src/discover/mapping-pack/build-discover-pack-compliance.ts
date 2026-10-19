import type { HiveDiscoverProposalV2, HiveDiscoverValidationResult } from "@hiveforyou/shared/discover";

import type {
  DiscoverClassificationDisposition,
  DiscoverLogicalDocumentClassification,
  DiscoverMappingPackContext,
  DiscoverPackComplianceResult,
} from "./types.js";

export function buildDiscoverPackCompliance(input: {
  context: DiscoverMappingPackContext;
  proposal: HiveDiscoverProposalV2;
  validation: HiveDiscoverValidationResult;
}): DiscoverPackComplianceResult {
  const allowedTypes = new Set(input.context.discoverView.documentTypes);
  const issuePaths = new Set(
    input.validation.issues.map((issue) => issue.path).filter((path): path is string => Boolean(path)),
  );

  const classifications: DiscoverLogicalDocumentClassification[] = input.proposal.logicalDocuments.map((doc) => {
    const pathPrefix = `logicalDocuments/${doc.id}`;
    const typePath = `${pathPrefix}/documentType`;
    const proposedDocumentType = doc.documentType?.trim() ?? "";
    let disposition: DiscoverClassificationDisposition = "accepted";
    let reason: string | undefined;

    if (issuePaths.has(typePath) || issuePaths.has(pathPrefix)) {
      disposition = "rejected";
      reason =
        input.validation.issues.find((issue) => issue.path === typePath || issue.path === pathPrefix)?.message ??
        "Validation rejected classification";
    } else if (
      doc.recognitionStatus === "ambiguous" ||
      doc.recognitionStatus === "unrecognized" ||
      doc.recognitionStatus === "proposed_type"
    ) {
      disposition = "unresolved";
      reason = `recognitionStatus=${doc.recognitionStatus ?? "unknown"}`;
    } else if (!proposedDocumentType || !allowedTypes.has(proposedDocumentType)) {
      disposition = "unresolved";
      reason = "Document type not in compiled pack vocabulary";
    }

    return {
      logicalDocumentId: doc.id,
      sourceDocumentId: doc.sourceDocumentId,
      pageStart: doc.pageStart,
      pageEnd: doc.pageEnd,
      proposedDocumentType,
      disposition,
      recognitionStatus: doc.recognitionStatus,
      reason,
    };
  });

  const proposedDocumentTypes = [
    ...new Set(input.proposal.logicalDocuments.map((doc) => doc.documentType?.trim()).filter(Boolean) as string[]),
  ];

  return {
    schemaVersion: "hive.discover-pack-compliance/1",
    packPin: input.context.pin,
    definitionsApplied: {
      documentTypes: [...input.context.discoverView.documentTypes],
      recognitionHints: input.context.discoverView.recognitionHints,
      documentProfileConceptMappings: input.context.discoverView.documentProfileConceptMappings ?? {},
    },
    proposedDocumentTypes,
    classifications,
    validation: input.validation,
  };
}
