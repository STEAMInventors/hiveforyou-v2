import { describe, expect, it } from "vitest";

import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";

import {
  StudyArtifactContentMismatchError,
  decideStudyArtifactSave,
  fingerprintStudyArtifactContent,
  isStudyArtifactProposePlaceholder,
} from "./study-artifact-persistence";
import { InMemoryStudyArtifactRepository } from "./study-artifact-repository";

const placeholderValidation: CanonicalStudyValidationResultV3 = {
  status: "FAILED",
  accepted: { entities: [], claims: [], conflicts: [], missingInformation: [] },
  rejected: [],
  warnings: [],
  unresolved: [],
  validationErrors: [],
  provenanceErrors: [],
  integrityErrors: [],
};

const succeededValidation: CanonicalStudyValidationResultV3 = {
  status: "SUCCEEDED",
  accepted: { entities: [], claims: [], conflicts: [], missingInformation: [] },
  rejected: [],
  warnings: [],
  unresolved: [],
  validationErrors: [],
  provenanceErrors: [],
  integrityErrors: [],
};

const proposal = { modelMetadata: { proposalMode: "fixture", providerId: "test" } };

describe("study artifact persistence", () => {
  it("treats propose placeholder validation as updatable", () => {
    expect(isStudyArtifactProposePlaceholder(placeholderValidation)).toBe(true);
    expect(isStudyArtifactProposePlaceholder(succeededValidation)).toBe(false);
  });

  it("allows validation completion when proposal matches", () => {
    const decision = decideStudyArtifactSave(
      { rawProposalJson: proposal, validationResultJson: placeholderValidation },
      { rawProposalJson: proposal, validationResultJson: succeededValidation },
    );
    expect(decision.action).toBe("updateValidation");
  });

  it("no-ops when full content fingerprint matches", () => {
    const incoming = { rawProposalJson: proposal, validationResultJson: succeededValidation };
    const decision = decideStudyArtifactSave(incoming, incoming);
    expect(decision.action).toBe("noop");
  });

  it("rejects conflicting proposal fingerprints", () => {
    expect(() =>
      decideStudyArtifactSave(
        { rawProposalJson: proposal, validationResultJson: placeholderValidation },
        { rawProposalJson: { other: true }, validationResultJson: succeededValidation },
      ),
    ).toThrow(StudyArtifactContentMismatchError);
  });

  it("rejects conflicting validation when placeholder was already replaced", () => {
    const altValidation: CanonicalStudyValidationResultV3 = {
      ...succeededValidation,
      status: "NEEDS_REVIEW",
    };
    expect(() =>
      decideStudyArtifactSave(
        { rawProposalJson: proposal, validationResultJson: succeededValidation },
        { rawProposalJson: proposal, validationResultJson: altValidation },
      ),
    ).toThrow(StudyArtifactContentMismatchError);
  });
});

describe("InMemoryStudyArtifactRepository", () => {
  it("mirrors propose, validate, and validate retry with one row", async () => {
    const repo = new InMemoryStudyArtifactRepository();
    const studyRunId = "run-1";
    await repo.save({
      studyRunId,
      caseId: "case-1",
      userId: "user-1",
      rawProposalJson: proposal,
      validationResultJson: placeholderValidation,
    });
    await repo.save({
      studyRunId,
      caseId: "case-1",
      userId: "user-1",
      rawProposalJson: proposal,
      validationResultJson: succeededValidation,
    });
    const fp = fingerprintStudyArtifactContent({
      rawProposalJson: proposal,
      validationResultJson: succeededValidation,
    });
    await repo.save({
      studyRunId,
      caseId: "case-1",
      userId: "user-1",
      rawProposalJson: proposal,
      validationResultJson: succeededValidation,
    });
    const row = await repo.getByStudyRunId(studyRunId);
    expect(
      fingerprintStudyArtifactContent({
        rawProposalJson: row!.rawProposalJson,
        validationResultJson: row!.validationResultJson as CanonicalStudyValidationResultV3,
      }),
    ).toBe(fp);
  });
});
