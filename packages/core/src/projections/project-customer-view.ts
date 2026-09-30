import type { CaseIntelligenceSnapshot } from "@hiveforyou/canonical";
import type { Engine2DomainCustomerContext } from "@hiveforyou/shared/case-customer-context";
import { CUSTOMER_VIEW_SCHEMA, type CustomerView } from "@hiveforyou/shared/projections";

export type ProjectCustomerViewInput = {
  intelligence: CaseIntelligenceSnapshot;
  customerContext?: Engine2DomainCustomerContext | null;
};

/**
 * Deterministic Customer View scaffold — pack-driven section specs will refine ordering.
 * Narrative blocks use claim statements directly (claim-id bound); no new facts.
 */
export function projectCustomerView(input: ProjectCustomerViewInput): CustomerView {
  const { intelligence, customerContext } = input;
  const factualClaimIds = intelligence.claims.filter((c) => c.isFactual).map((c) => c.id);
  const timelineEventIds = [...intelligence.events]
    .sort((a, b) => {
      const aKey = a.occurredOn ?? "";
      const bKey = b.occurredOn ?? "";
      return aKey.localeCompare(bKey);
    })
    .map((event) => event.id);

  return {
    schemaVersion: CUSTOMER_VIEW_SCHEMA,
    caseId: intelligence.caseId,
    intelligenceVersion: intelligence.version,
    domainIds: intelligence.domainSlices?.map((s) => s.domainId) ?? [intelligence.domainId],
    objectiveEcho: customerContext?.objective,
    sections: [
      {
        id: "key_findings",
        title: "What the documents show",
        blocks: [
          {
            kind: "narrative",
            sentences: intelligence.claims
              .filter((c) => c.isFactual)
              .slice(0, 12)
              .map((c) => ({ text: c.statement, claimIds: [c.id] })),
          },
          { kind: "claim_list", claimIds: factualClaimIds },
        ],
      },
      ...(timelineEventIds.length
        ? [
            {
              id: "timeline",
              title: "Timeline",
              blocks: [{ kind: "timeline" as const, eventIds: timelineEventIds }],
            },
          ]
        : []),
      ...(intelligence.conflicts.length
        ? [
            {
              id: "conflicts",
              title: "Areas where documents disagree",
              blocks: intelligence.conflicts.map((conflict) => ({
                kind: "conflict" as const,
                conflictId: conflict.id,
              })),
            },
          ]
        : []),
      ...(intelligence.missingness.length
        ? [
            {
              id: "gaps",
              title: "Information not found in your documents",
              blocks: intelligence.missingness.map((gap) => ({
                kind: "gap" as const,
                missingnessId: gap.id,
              })),
            },
          ]
        : []),
    ],
  };
}
