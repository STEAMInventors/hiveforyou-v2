import { IEP_EVIDENCE_REQUIREMENTS } from "./requirements";

/** Requirements whose expected document type is not among the documents already present. */
export function unmetIepEvidenceRequirements(presentDocumentTypes: readonly string[]) {
  const present = new Set(presentDocumentTypes);
  return IEP_EVIDENCE_REQUIREMENTS.filter(
    (requirement) => !present.has(requirement.expectedDocumentType),
  );
}
