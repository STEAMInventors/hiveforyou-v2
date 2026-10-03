import type { DiscoverMissingExpectation } from "./types";
import type { IntakePackCompletenessRow } from "./intake-execution";

export type MissingEvidenceDisposition = {
  packExpectationId: string;
  disposition: "UPLOAD" | "I_DONT_HAVE_IT" | "NOT_APPLICABLE";
};

export function evaluatePackCompleteness(input: {
  missingExpectations: readonly DiscoverMissingExpectation[];
  presentDocumentTypes: ReadonlySet<string>;
  dispositions?: readonly MissingEvidenceDisposition[];
}): IntakePackCompletenessRow[] {
  const dispositionByExpectation = new Map(
    (input.dispositions ?? []).map((item) => [item.packExpectationId, item.disposition]),
  );

  return input.missingExpectations.map((expectation) => {
    const disposition = dispositionByExpectation.get(expectation.packExpectationId);
    const satisfied = input.presentDocumentTypes.has(expectation.expectedDocumentType);

    if (satisfied) {
      return {
        packExpectationId: expectation.packExpectationId,
        requirementClass: expectation.requirementClass,
        expectedDocumentType: expectation.expectedDocumentType,
        state: "SATISFIED" as const,
      };
    }
    if (disposition === "NOT_APPLICABLE") {
      return {
        packExpectationId: expectation.packExpectationId,
        requirementClass: expectation.requirementClass,
        expectedDocumentType: expectation.expectedDocumentType,
        state: "NOT_APPLICABLE" as const,
        disposition: "NOT_APPLICABLE" as const,
      };
    }
    if (disposition === "I_DONT_HAVE_IT" || disposition === "UPLOAD") {
      return {
        packExpectationId: expectation.packExpectationId,
        requirementClass: expectation.requirementClass,
        expectedDocumentType: expectation.expectedDocumentType,
        state: "DISPOSITIONED" as const,
        disposition,
      };
    }
    return {
      packExpectationId: expectation.packExpectationId,
      requirementClass: expectation.requirementClass,
      expectedDocumentType: expectation.expectedDocumentType,
      state: "OPEN" as const,
    };
  });
}
