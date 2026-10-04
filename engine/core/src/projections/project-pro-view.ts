import type { CaseIntelligenceSnapshot } from "@hiveforyou/canonical";
import { PRO_VIEW_SCHEMA, type ProView } from "@hiveforyou/shared/projections";

/** Deterministic Pro View from validated canonical intelligence — no source reread. */
export function projectProView(intelligence: CaseIntelligenceSnapshot): ProView {
  return {
    schemaVersion: PRO_VIEW_SCHEMA,
    caseId: intelligence.caseId,
    intelligenceVersion: intelligence.version,
    domainIds: intelligence.domainSlices?.map((s) => s.domainId) ?? [intelligence.domainId],
    entities: intelligence.entities,
    claims: intelligence.claims,
    claimEvidence: intelligence.claimEvidence,
    relationships: intelligence.relationships,
    crossDomainRelationships: intelligence.crossDomainRelationships,
    events: intelligence.events,
    conflicts: intelligence.conflicts,
    missingness: intelligence.missingness,
  };
}
