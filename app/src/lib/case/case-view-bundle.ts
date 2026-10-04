import type { StudySourceDocumentRef } from "@hiveforyou/shared/canonical-study";
import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type { StructureMap } from "@hiveforyou/shared/discover/structure-map";
import type { CaseProvenanceBundle, CustomerView, ProView } from "@hiveforyou/shared/projections";

export type CaseViewBundle = {
  caseId: string;
  intelligenceVersion: number;
  intelligenceSchema: "case-intelligence/3";
  customerView: CustomerView;
  proView: ProView;
  provenance: CaseProvenanceBundle;
  structureMap: StructureMap | null;
  sourceDocuments: StudySourceDocumentRef[];
  studyStatus: "ready" | "unavailable";
  canonicalSnapshot: CanonicalCaseSnapshot | null;
};
