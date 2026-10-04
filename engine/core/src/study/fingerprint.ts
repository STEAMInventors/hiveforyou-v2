import { createHash } from "node:crypto";

import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

export type StudyEngineFingerprint = {
  providerMode: "fixture" | "openai" | "unconfigured";
  providerId: string;
  modelId?: string;
  promptVersion?: string;
  promptSha256?: string;
};

export type IdempotencyInput = {
  caseId: string;
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  documentFingerprint: string;
  answerFingerprint: string;
  intakeRunId?: string | null;
  intakeStudyMaterialFingerprint?: string | null;
  engine: StudyEngineFingerprint;
};

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return v;
  });
}

export function fingerprintSourceDocuments(
  request: StartCanonicalStudyRequest,
): string {
  const docs = request.sourceDocuments
    .map((d) => ({
      stagedDocumentId: d.stagedDocumentId,
      discoveryDocumentId: d.discoveryDocumentId ?? null,
      originalFilename: d.originalFilename,
      sizeBytes: d.sizeBytes,
      mimeType: d.mimeType ?? null,
    }))
    .sort((a, b) => a.stagedDocumentId.localeCompare(b.stagedDocumentId));
  return createHash("sha256").update(stableStringify(docs)).digest("hex");
}

export function fingerprintAnswerSnapshot(
  request: StartCanonicalStudyRequest,
): string {
  const payload = {
    questionSetId: request.answerSnapshot.questionSetId,
    answers: request.answerSnapshot.answers,
    missingNodeStates: request.answerSnapshot.missingNodeStates,
    ambiguityNodeStates: request.answerSnapshot.ambiguityNodeStates,
    analysisIntent: request.answerSnapshot.analysisIntent,
    userContext: request.answerSnapshot.userContext,
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export function computeStudyIdempotencyKey(input: IdempotencyInput): string {
  const material = stableStringify(input);
  return createHash("sha256").update(material).digest("hex");
}

export function hashCanonicalJson(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
