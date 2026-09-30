import type { CaseIntelligenceSnapshot } from "@hiveforyou/canonical";
import type { StructureMap } from "@hiveforyou/shared/discover/structure-map";
import {
  CASE_PROVENANCE_BUNDLE_SCHEMA,
  type CaseProvenanceBundle,
  type ResolvedEvidenceRef,
} from "@hiveforyou/shared/projections";

function resolveRef(
  ref: ResolvedEvidenceRef,
  intelligence: CaseIntelligenceSnapshot,
  structureMap: StructureMap | null | undefined,
): ResolvedEvidenceRef {
  const source = intelligence.sourceDocuments.find(
    (doc) => doc.sourceDocumentId === ref.sourceDocumentId,
  );
  const logical = ref.logicalDocumentId
    ? structureMap?.logicalDocuments.find((doc) => doc.id === ref.logicalDocumentId)
    : undefined;

  return {
    ...ref,
    logicalTitle: logical?.title,
    logicalDocumentType: logical?.documentType,
    logicalDomainId: logical?.domainId,
    sourceFilename: source?.originalFilename,
    sha256: source?.sha256,
  };
}

/** Sanitized provenance index for evidence UI — no new facts. */
export function buildCaseProvenanceBundle(input: {
  intelligence: CaseIntelligenceSnapshot;
  structureMap?: StructureMap | null;
}): CaseProvenanceBundle {
  const { intelligence, structureMap } = input;
  const claims = intelligence.claims.map((claim) => {
    const documentEvidence = claim.evidenceRefs
      .filter((ref) => ref.sourceType === "document")
      .map((ref) => resolveRef({ ...ref }, intelligence, structureMap));

    return {
      claimId: claim.id,
      documentEvidence,
    };
  });

  return {
    schemaVersion: CASE_PROVENANCE_BUNDLE_SCHEMA,
    caseId: intelligence.caseId,
    intelligenceVersion: intelligence.version,
    claims,
  };
}
