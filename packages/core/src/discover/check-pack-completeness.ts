import type { DiscoverDomainPackSnapshot } from "@hiveforyou/domain-packs";
import type {
  StructureMapCompleteness,
  StructureMapCompletenessExpectation,
  StructureMapLogicalDocument,
} from "@hiveforyou/shared/discover";

/** One row per stable Pack requirement id. Later duplicates are dropped. */
export function dedupeCompletenessExpectations(
  expectations: StructureMapCompletenessExpectation[],
): StructureMapCompletenessExpectation[] {
  const seen = new Set<string>();
  const deduped: StructureMapCompletenessExpectation[] = [];
  for (const expectation of expectations) {
    if (seen.has(expectation.packExpectationId)) {
      continue;
    }
    seen.add(expectation.packExpectationId);
    deduped.push(expectation);
  }
  return deduped;
}

export type MissingEvidenceDisposition = {
  packExpectationId: string;
  disposition: "UPLOAD" | "I_DONT_HAVE_IT" | "NOT_APPLICABLE";
};

export function checkPackCompleteness(input: {
  pack: DiscoverDomainPackSnapshot;
  logicalDocuments: StructureMapLogicalDocument[];
  unresolvedBlocking: boolean;
  dispositions?: MissingEvidenceDisposition[];
}): StructureMapCompleteness {
  const presentTypes = new Set(input.logicalDocuments.map((doc) => doc.documentType));
  const dispositionByExpectation = new Map(
    (input.dispositions ?? []).map((item) => [item.packExpectationId, item.disposition]),
  );

  const expectations = input.pack.missingExpectations.map((expectation) => {
    const disposition = dispositionByExpectation.get(expectation.packExpectationId);
    const satisfied = presentTypes.has(expectation.expectedDocumentType);

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

    if (disposition === "I_DONT_HAVE_IT") {
      return {
        packExpectationId: expectation.packExpectationId,
        requirementClass: expectation.requirementClass,
        state: "DISPOSITIONED" as const,
        expectedDocumentType: expectation.expectedDocumentType,
        disposition: "I_DONT_HAVE_IT" as const,
      };
    }

    if (disposition === "UPLOAD") {
      return {
        packExpectationId: expectation.packExpectationId,
        requirementClass: expectation.requirementClass,
        expectedDocumentType: expectation.expectedDocumentType,
        state: "DISPOSITIONED" as const,
        disposition: "UPLOAD" as const,
      };
    }

    return {
      packExpectationId: expectation.packExpectationId,
      requirementClass: expectation.requirementClass,
      expectedDocumentType: expectation.expectedDocumentType,
      state: "MISSING" as const,
    };
  });

  const hasMissing = expectations.some((item) => item.state === "MISSING");
  let status: StructureMapCompleteness["status"] = "complete";
  if (input.unresolvedBlocking) {
    status = "blocked_unresolved_structure";
  } else if (hasMissing) {
    status = "missing_evidence";
  }

  return { status, expectations: dedupeCompletenessExpectations(expectations) };
}
