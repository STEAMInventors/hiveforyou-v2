import type { CustomerView } from "@hiveforyou/shared/projections";

export type ProjectionNarrativeValidationIssue = {
  code: "UNKNOWN_CLAIM_IN_NARRATIVE";
  message: string;
  claimIds: string[];
};

/** No validated claim → no narrative statement. */
export function validateCustomerViewNarrativeClaims(
  view: CustomerView,
  validatedClaimIds: Set<string>,
): ProjectionNarrativeValidationIssue[] {
  const issues: ProjectionNarrativeValidationIssue[] = [];
  for (const section of view.sections) {
    for (const block of section.blocks) {
      if (block.kind !== "narrative") {
        continue;
      }
      for (const sentence of block.sentences) {
        const unknown = sentence.claimIds.filter((id) => !validatedClaimIds.has(id));
        if (unknown.length) {
          issues.push({
            code: "UNKNOWN_CLAIM_IN_NARRATIVE",
            message: "Narrative sentence references claim ids not in validated intelligence.",
            claimIds: unknown,
          });
        }
        if (!sentence.claimIds.length) {
          issues.push({
            code: "UNKNOWN_CLAIM_IN_NARRATIVE",
            message: "Narrative sentence must bind to at least one validated claim id.",
            claimIds: [],
          });
        }
      }
    }
  }
  return issues;
}
