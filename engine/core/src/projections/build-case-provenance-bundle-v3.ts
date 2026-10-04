import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type { StructureMap } from "@hiveforyou/shared/discover/structure-map";
import {
  CASE_PROVENANCE_BUNDLE_SCHEMA,
  type CaseProvenanceBundle,
  type ResolvedEvidenceRef,
} from "@hiveforyou/shared/projections";

function resolveRef(
  ref: ResolvedEvidenceRef,
  intelligence: CanonicalCaseSnapshot,
  structureMap: StructureMap | null | undefined,
): ResolvedEvidenceRef {
  const source = intelligence.sourceDocuments.find(
    (doc) =>
      doc.sourceDocumentId === ref.sourceDocumentId ||
      doc.stagedDocumentId === ref.sourceDocumentId,
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

export function buildCaseProvenanceBundleV3(input: {
  intelligence: CanonicalCaseSnapshot;
  structureMap?: StructureMap | null;
}): CaseProvenanceBundle {
  const { intelligence, structureMap } = input;
  const claims = intelligence.claims.map((claim) => ({
    claimId: claim.id,
    documentEvidence: claim.evidenceRefs.map((ref) =>
      resolveRef({ ...ref }, intelligence, structureMap),
    ),
  }));

  return {
    schemaVersion: CASE_PROVENANCE_BUNDLE_SCHEMA,
    caseId: intelligence.caseId,
    intelligenceVersion: intelligence.version,
    claims,
  };
}
