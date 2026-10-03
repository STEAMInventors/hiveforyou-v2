import {
  isDocumentIdentityType,
  type DocumentIdentityType,
} from "@hiveforyou/shared/intake";

import {
  DOCUMENT_IDENTITY_CRITERIA,
  DOCUMENT_IDENTITY_INSTRUCTIONS,
} from "./identity-criteria";
import {
  buildJevDomainRequest,
  parseJevDomainResponse,
  type JevDomainDecision,
} from "./jev-domain-client";

export const JEV_DECIDE_URL = "https://jevtypesafeai.com/api/v1/decide";

export const JEV_TIMEOUT_MS = 20_000;

export type JevErrorCode =
  | "JEV_REJECTED"
  | "JEV_TIMEOUT"
  | "JEV_UNAVAILABLE"
  | "JEV_INVALID_RESPONSE";

export class JevRequestError extends Error {
  readonly errorCode: JevErrorCode;

  constructor(errorCode: JevErrorCode) {
    super(errorCode);
    this.name = "JevRequestError";
    this.errorCode = errorCode;
  }
}

export type JevIdentityDecision = {
  choice: DocumentIdentityType;
  confidence: number;
  returnedModel: string | null;
  classifierVersion: string | null;
};

export type JevIdentityRequest = {
  state: string;
  questions: {
    document_identity: {
      type: "choice";
      instructions: string;
      criteria: Record<DocumentIdentityType, string>;
    };
  };
};

/** State is the text sample only. Do not add filename, path, or case fields. */
export function buildJevIdentityRequest(sample: string): JevIdentityRequest {
  return {
    state: sample,
    questions: {
      document_identity: {
        type: "choice",
        instructions: DOCUMENT_IDENTITY_INSTRUCTIONS,
        criteria: DOCUMENT_IDENTITY_CRITERIA,
      },
    },
  };
}

export function parseJevIdentityResponse(body: unknown): JevIdentityDecision {
  if (!body || typeof body !== "object") {
    throw new JevRequestError("JEV_INVALID_RESPONSE");
  }
  const record = body as Record<string, unknown>;
  const answers = record.answers;
  if (!answers || typeof answers !== "object") {
    throw new JevRequestError("JEV_INVALID_RESPONSE");
  }
  const answer = (answers as Record<string, unknown>).document_identity;
  if (!answer || typeof answer !== "object") {
    throw new JevRequestError("JEV_INVALID_RESPONSE");
  }
  const choice = (answer as Record<string, unknown>).choice;
  const confidence = (answer as Record<string, unknown>).confidence;
  if (typeof choice !== "string" || !isDocumentIdentityType(choice)) {
    throw new JevRequestError("JEV_INVALID_RESPONSE");
  }
  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new JevRequestError("JEV_INVALID_RESPONSE");
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

export async function decideDocumentIdentity(
  deps: {
    apiKey: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  },
  sample: string,
): Promise<JevIdentityDecision> {
  if (!deps.apiKey.trim()) {
    throw new JevRequestError("JEV_UNAVAILABLE");
  }
  if (sample.trim().length === 0) {
    throw new JevRequestError("JEV_INVALID_RESPONSE");
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = deps.timeoutMs ?? JEV_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(JEV_DECIDE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deps.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildJevIdentityRequest(sample)),
      signal: controller.signal,
    });
    if (response.status === 400) {
      throw new JevRequestError("JEV_REJECTED");
    }
    if (!response.ok) {
      throw new JevRequestError("JEV_UNAVAILABLE");
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new JevRequestError("JEV_INVALID_RESPONSE");
    }
    return parseJevIdentityResponse(body);
  } catch (error) {
    if (error instanceof JevRequestError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new JevRequestError("JEV_TIMEOUT");
    }
    throw new JevRequestError("JEV_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}

export async function decideDomainRouting(
  deps: {
    apiKey: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  },
  rawIntent: string,
): Promise<JevDomainDecision> {
  if (!deps.apiKey.trim()) {
    throw new JevRequestError("JEV_UNAVAILABLE");
  }
  if (rawIntent.trim().length === 0) {
    throw new JevRequestError("JEV_INVALID_RESPONSE");
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = deps.timeoutMs ?? JEV_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(JEV_DECIDE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deps.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildJevDomainRequest(rawIntent)),
      signal: controller.signal,
    });
    if (response.status === 400) {
      throw new JevRequestError("JEV_REJECTED");
    }
    if (!response.ok) {
      throw new JevRequestError("JEV_UNAVAILABLE");
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new JevRequestError("JEV_INVALID_RESPONSE");
    }
    return parseJevDomainResponse(body);
  } catch (error) {
    if (error instanceof JevRequestError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new JevRequestError("JEV_TIMEOUT");
    }
    throw new JevRequestError("JEV_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}
