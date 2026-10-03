import { getIntakePackExecutor, isDomainPackExecutable } from "@hiveforyou/domain-pack";

export type IntakeStudyPath = "DOMAIN_PACK" | "GENERIC_STUDY";

export type IntakeDomainResolution = {
  rawIntent: string | null;
  explicitDomainId: string | null;
  jevDomainProposal: string | null;
  jevDomainConfidence: number | null;
  resolvedDomainId: string | null;
  resolutionSource: "EXPLICIT" | "JEV" | "UNRESOLVED" | null;
  studyPath: IntakeStudyPath;
};

export function resolveIntakeDomain(input: {
  rawIntent: string | null;
  explicitDomainId: string | null;
  jevDomainProposal?: string | null;
  jevDomainConfidence?: number | null;
}): IntakeDomainResolution {
  const explicit = input.explicitDomainId?.trim() || null;
  const rawIntent = input.rawIntent?.trim() || null;

  if (explicit && isDomainPackExecutable(explicit)) {
    return {
      rawIntent,
      explicitDomainId: explicit,
      jevDomainProposal: null,
      jevDomainConfidence: null,
      resolvedDomainId: explicit,
      resolutionSource: "EXPLICIT",
      studyPath: "DOMAIN_PACK",
    };
  }

  if (explicit && !isDomainPackExecutable(explicit)) {
    return {
      rawIntent,
      explicitDomainId: explicit,
      jevDomainProposal: null,
      jevDomainConfidence: null,
      resolvedDomainId: null,
      resolutionSource: "UNRESOLVED",
      studyPath: "GENERIC_STUDY",
    };
  }

  const jevChoice = input.jevDomainProposal?.trim() || null;
  const confidence = input.jevDomainConfidence ?? null;
  if (jevChoice === "NO_MATCH" || !jevChoice) {
    return {
      rawIntent,
      explicitDomainId: null,
      jevDomainProposal: jevChoice,
      jevDomainConfidence: confidence,
      resolvedDomainId: null,
      resolutionSource: jevChoice ? "JEV" : "UNRESOLVED",
      studyPath: "GENERIC_STUDY",
    };
  }

  if (isDomainPackExecutable(jevChoice) && getIntakePackExecutor(jevChoice)) {
    return {
      rawIntent,
      explicitDomainId: null,
      jevDomainProposal: jevChoice,
      jevDomainConfidence: confidence,
      resolvedDomainId: jevChoice,
      resolutionSource: "JEV",
      studyPath: "DOMAIN_PACK",
    };
  }

  return {
    rawIntent,
    explicitDomainId: null,
    jevDomainProposal: jevChoice,
    jevDomainConfidence: confidence,
    resolvedDomainId: null,
    resolutionSource: "JEV",
    studyPath: "GENERIC_STUDY",
  };
}
