import { listRoutableDomainPackManifests } from "@hiveforyou/domain-pack";

export const JEV_DOMAIN_NO_MATCH = "NO_MATCH" as const;

export type JevDomainDecision = {
  choice: string;
  confidence: number;
  returnedModel: string | null;
  classifierVersion: string | null;
};

export type JevDomainRequest = {
  state: string;
  questions: {
    domain_routing: {
      type: "choice";
      instructions: string;
      criteria: Record<string, string>;
    };
  };
};

export function buildJevDomainRoutingCriteria(): Record<string, string> {
  const criteria: Record<string, string> = {
    [JEV_DOMAIN_NO_MATCH]:
      "The user's stated purpose does not clearly match any listed domain pack.",
  };
  for (const manifest of listRoutableDomainPackManifests()) {
    criteria[manifest.id] = manifest.description || manifest.name;
  }
  return criteria;
}

export function buildJevDomainRequest(rawIntent: string): JevDomainRequest {
  return {
    state: rawIntent.trim(),
    questions: {
      domain_routing: {
        type: "choice",
        instructions:
          "Which registered Domain Pack best matches the user's stated purpose? Answer with the pack id or NO_MATCH only.",
        criteria: buildJevDomainRoutingCriteria(),
      },
    },
  };
}

export function parseJevDomainResponse(body: unknown): JevDomainDecision {
  if (!body || typeof body !== "object") {
    throw new Error("JEV_INVALID_RESPONSE");
  }
  const record = body as Record<string, unknown>;
  const answers = record.answers;
  if (!answers || typeof answers !== "object") {
    throw new Error("JEV_INVALID_RESPONSE");
  }
  const answer = (answers as Record<string, unknown>).domain_routing;
  if (!answer || typeof answer !== "object") {
    throw new Error("JEV_INVALID_RESPONSE");
  }
  const choice = (answer as Record<string, unknown>).choice;
  const confidence = (answer as Record<string, unknown>).confidence;
  if (typeof choice !== "string" || choice.trim().length === 0) {
    throw new Error("JEV_INVALID_RESPONSE");
  }
  const allowed = new Set([...Object.keys(buildJevDomainRoutingCriteria())]);
  if (!allowed.has(choice)) {
    throw new Error("JEV_INVALID_RESPONSE");
  }
  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new Error("JEV_INVALID_RESPONSE");
  }
  const returnedModel =
    typeof record.model === "string" && record.model.trim().length > 0
      ? record.model.trim()
      : null;
  const classifierVersion =
    typeof record.classifier_version === "string" && record.classifier_version.trim().length > 0
      ? record.classifier_version.trim()
      : null;
  return { choice, confidence, returnedModel, classifierVersion };
}
