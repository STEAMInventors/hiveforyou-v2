import { readFileSync } from "node:fs";

import type {
  CanonicalStudyReasoner,
  CanonicalStudyReasonerRequest,
  CanonicalStudyReasonerProposal,
} from "@hiveforyou/shared/canonical-study-graph";
import {
  CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION,
} from "@hiveforyou/shared/canonical-study-graph";

import {
  CANONICAL_REASONER_PROMPT_ID,
  CANONICAL_REASONER_PROMPT_VERSION,
  canonicalReasonerPromptSha256,
} from "./prompt-metadata.js";
import { MalformedCanonicalReasonerProposalError } from "./reasoner-errors.js";
import { validateReasonerProposalStructure } from "./validate-proposal-references.js";

export type FixtureCanonicalReasonerOptions = {
  fixturePath: string;
  providerId?: string;
  modelId?: string;
};

type FixtureFile = {
  graphBody: Omit<
    CanonicalStudyReasonerProposal,
    "schemaVersion" | "studyRunId" | "attemptId" | "packPin" | "modelPin"
  >;
};

export class FixtureCanonicalReasoner implements CanonicalStudyReasoner {
  private readonly fixture: FixtureFile;

  constructor(private readonly options: FixtureCanonicalReasonerOptions) {
    this.fixture = JSON.parse(readFileSync(options.fixturePath, "utf8")) as FixtureFile;
  }

  async propose(request: CanonicalStudyReasonerRequest): Promise<CanonicalStudyReasonerProposal> {
    const assembled: CanonicalStudyReasonerProposal = {
      schemaVersion: CANONICAL_STUDY_REASONER_PROPOSAL_SCHEMA_VERSION,
      studyRunId: request.studyRunId,
      attemptId: request.attemptId,
      packPin: request.packPin,
      modelPin: {
        providerId: this.options.providerId ?? "fixture-canonical-reasoner",
        modelId: this.options.modelId ?? "fixture",
        promptId: CANONICAL_REASONER_PROMPT_ID,
        promptVersion: CANONICAL_REASONER_PROMPT_VERSION,
        promptSha256: canonicalReasonerPromptSha256(),
      },
      ...this.fixture.graphBody,
    };
    const validated = validateReasonerProposalStructure(assembled, request.observationSnapshot);
    if (!validated.ok) {
      throw new MalformedCanonicalReasonerProposalError(
        "MALFORMED_REASONER_PROPOSAL:fixture",
        assembled,
        validated.violations,
      );
    }
    return validated.proposal;
  }
}
