import type { ReasonerReferenceViolation } from "./validate-proposal-references.js";

export class CanonicalReasonerUnavailableError extends Error {
  readonly code = "REASONER_UNAVAILABLE" as const;

  constructor(message: string) {
    super(message);
    this.name = "CanonicalReasonerUnavailableError";
  }
}

export class MalformedCanonicalReasonerProposalError extends Error {
  readonly code = "MALFORMED_REASONER_PROPOSAL" as const;

  constructor(
    message: string,
    readonly proposal?: unknown,
    readonly violations?: ReasonerReferenceViolation[],
  ) {
    super(message);
    this.name = "MalformedCanonicalReasonerProposalError";
  }
}
