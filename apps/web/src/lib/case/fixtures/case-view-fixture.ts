/**
 * Dev/test fixture only — not production data.
 */
import type { CaseViewBundle } from "@/lib/case/case-view-bundle";

export const CASE_VIEW_FIXTURE: CaseViewBundle = {
  caseId: "fixture-case",
  intelligenceVersion: 1,
  studyStatus: "ready",
  structureMap: null,
  sourceDocuments: [],
  provenance: {
    schemaVersion: "case-provenance-bundle/1",
    caseId: "fixture-case",
    intelligenceVersion: 1,
    claims: [],
  },
  customerView: {
    schemaVersion: "customer-view/1",
    caseId: "fixture-case",
    intelligenceVersion: 1,
    domainIds: ["iep"],
    objectiveEcho: "Understand how services have changed over time.",
    sections: [],
  },
  proView: {
    schemaVersion: "pro-view/1",
    caseId: "fixture-case",
    intelligenceVersion: 1,
    domainIds: ["iep"],
    entities: [],
    claims: [],
    claimEvidence: [],
    relationships: [],
    events: [],
    conflicts: [],
    missingness: [],
  },
};
