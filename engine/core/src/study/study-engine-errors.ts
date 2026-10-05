
/** OpenAI/API transport or configuration failure — not a parseable proposal. */
export class CanonicalStudyEngineUnavailableError extends Error {
  readonly code = "ENGINE_UNAVAILABLE" as const;

  constructor(message: string) {
    super(message);
    this.name = "CanonicalStudyEngineUnavailableError";
  }
}

/** Model returned a body that cannot be parsed or does not match the proposal contract. */
export class MalformedCanonicalStudyProposalError extends Error {
  readonly code = "MALFORMED_PROPOSAL" as const;

  constructor(
    message: string,
    readonly proposal?: unknown,
  ) {
    super(message);
    this.name = "MalformedCanonicalStudyProposalError";
  }
}

export function malformedStudyProposalPlaceholder(
  domainId: string,
): import("@hiveforyou/shared/canonical-study").CanonicalStudyProposalV2 {
  return {
    schemaVersion: "canonical-study-proposal/0" as import("@hiveforyou/shared/canonical-study").CanonicalStudyProposalV2["schemaVersion"],
    domainId,
    entities: [],
    claims: [],
    relationships: [],
    events: [],
    conflicts: [],
    missingness: [],
    derivedClaimCandidates: [],
    warnings: [],
    sourceReferences: [],
    modelMetadata: {
      providerId: "malformed-placeholder",
      proposalMode: "production",
    },
    proposedAt: new Date().toISOString(),
  };
}
