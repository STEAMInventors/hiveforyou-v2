import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type { Engine2DomainCustomerContext } from "@hiveforyou/shared/case-customer-context";
import { CUSTOMER_VIEW_SCHEMA, type CustomerView } from "@hiveforyou/shared/projections";

import { formatValidatedClaimSentence } from "./format-v3-claim";

const PLAN_DECISION_ROLES = new Set([
  "planned",
  "required",
  "decided",
  "observed",
  "current",
]);

export function projectCustomerViewV3(input: {
  intelligence: CanonicalCaseSnapshot;
  customerContext?: Engine2DomainCustomerContext | null;
}): CustomerView {
  const { intelligence, customerContext } = input;
  const entitiesById = new Map(intelligence.entities.map((entity) => [entity.id, entity]));
  const sentenceFor = (claimId: string) => {
    const claim = intelligence.claims.find((row) => row.id === claimId);
    return claim ? formatValidatedClaimSentence(claim, entitiesById) : "";
  };

  const overviewClaimIds = intelligence.claims.slice(0, 8).map((claim) => claim.id);
  const keyFactIds = intelligence.claims.map((claim) => claim.id);
  const timelineEventIds = intelligence.events.map((event) => event.id);
  const planDecisionIds = intelligence.claims
    .filter((claim) => PLAN_DECISION_ROLES.has(claim.role))
    .map((claim) => claim.id);
  const changeClaimIds = intelligence.changes.flatMap((change) => [
    change.fromClaimId,
    change.toClaimId,
  ]);

  const sections: CustomerView["sections"] = [
    {
      id: "case_understanding",
      title: "What this case is about",
      blocks: [
        {
          kind: "narrative",
          sentences: overviewClaimIds.map((claimId) => ({
            text: sentenceFor(claimId),
            claimIds: [claimId],
          })),
        },
      ],
    },
    {
      id: "key_facts",
      title: "Important facts from your documents",
      blocks: [{ kind: "claim_list", claimIds: keyFactIds }],
    },
  ];

  if (timelineEventIds.length) {
    sections.push({
      id: "chronology",
      title: "Chronology",
      blocks: [{ kind: "timeline", eventIds: timelineEventIds }],
    });
  }

  if (planDecisionIds.length) {
    sections.push({
      id: "plans_decisions",
      title: "Decisions, plans, and observations",
      blocks: [{ kind: "claim_list", claimIds: planDecisionIds }],
    });
  }

  if (changeClaimIds.length) {
    sections.push({
      id: "changes",
      title: "Changes over time",
      blocks: [{ kind: "claim_list", claimIds: [...new Set(changeClaimIds)] }],
    });
  }

  if (intelligence.conflicts.length) {
    sections.push({
      id: "conflicts",
      title: "Unresolved disagreements",
      blocks: intelligence.conflicts.map((conflict) => ({
        kind: "conflict" as const,
        conflictId: conflict.id,
      })),
    });
  }

  const missingIds = intelligence.unresolved
    .filter((item) => item.kind === "missing_information")
    .map((item) => item.id);
  if (missingIds.length) {
    sections.push({
      id: "missing_information",
      title: "Information that appears missing",
      blocks: missingIds.map((missingnessId) => ({
        kind: "gap" as const,
        missingnessId,
      })),
    });
  }

  return {
    schemaVersion: CUSTOMER_VIEW_SCHEMA,
    caseId: intelligence.caseId,
    intelligenceVersion: intelligence.version,
    domainIds: [intelligence.domainId],
    objectiveEcho: customerContext?.objective,
    sections,
  };
}
