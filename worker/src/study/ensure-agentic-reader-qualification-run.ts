import { randomUUID } from "node:crypto";

import {
  assertL001QualificationDocumentScope,
  buildAgenticReaderQualificationEngineFingerprint,
  buildAgenticReaderQualificationRun,
  computeAgenticReaderQualificationIdempotencyKey,
  fingerprintRegisteredSourceDocuments,
  loadEffectiveStudyAgentsPromptMetadata,
  persistStudyRun,
  resolveAgenticReaderModelIdentity,
} from "@hiveforyou/core/study";
import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";

import type { HiveGateway } from "../persistence/hive-gateway.js";
import { SupabaseStudyRunRepository } from "../persistence/worker-supabase-repositories.js";
import { WorkerSourceDocumentRepository } from "../intake/worker-source-documents.js";

export class AgenticReaderQualificationError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "AgenticReaderQualificationError";
  }
}

async function assertCaseOwnership(
  gateway: HiveGateway,
  caseId: string,
  userId: string,
): Promise<void> {
  const rows = await gateway.selectWhere(
    "cases",
    { id: caseId, user_id: userId },
    { limit: 1 },
  );
  if (!rows[0]) {
    throw new AgenticReaderQualificationError(
      "Case not found for user.",
      "CASE_OWNERSHIP_FAILED",
    );
  }
}

export type EnsureAgenticReaderQualificationRunInput = {
  gateway: HiveGateway;
  caseId: string;
  userId: string;
  env?: Record<string, string | undefined>;
};

export type EnsureAgenticReaderQualificationRunResult = {
  run: CanonicalStudyRun;
  idempotencyKey: string;
  registeredDocuments: Array<{ id: string; sha256: string }>;
  prompt: ReturnType<typeof loadEffectiveStudyAgentsPromptMetadata>;
  modelIdentity: ReturnType<typeof resolveAgenticReaderModelIdentity>;
};

export async function ensureAgenticReaderQualificationRun(
  input: EnsureAgenticReaderQualificationRunInput,
): Promise<EnsureAgenticReaderQualificationRunResult> {
  const env = input.env ?? process.env;
  const caseId = env.HIVE_AGENTIC_READER_QUALIFICATION_CASE_ID?.trim() || input.caseId;
  const userId = env.HIVE_AGENTIC_READER_QUALIFICATION_USER_ID?.trim() || input.userId;
  if (!caseId || !userId) {
    throw new AgenticReaderQualificationError(
      "HIVE_AGENTIC_READER_QUALIFICATION_CASE_ID and HIVE_AGENTIC_READER_QUALIFICATION_USER_ID are required.",
      "QUALIFICATION_SCOPE_MISSING",
    );
  }

  await assertCaseOwnership(input.gateway, caseId, userId);

  const documentsRepo = new WorkerSourceDocumentRepository(input.gateway, userId);
  const registered = await documentsRepo.listByCase(userId, caseId);
  const sha256Values = registered.map((doc) => doc.sha256);
  try {
    assertL001QualificationDocumentScope(sha256Values);
  } catch {
    throw new AgenticReaderQualificationError(
      "Registered source documents do not match the L001 qualification corpus.",
      "L001_DOCUMENT_SCOPE_MISMATCH",
    );
  }

  const prompt = loadEffectiveStudyAgentsPromptMetadata({ env });
  let modelIdentity: ReturnType<typeof resolveAgenticReaderModelIdentity>;
  try {
    modelIdentity = resolveAgenticReaderModelIdentity(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "READER_MODEL_IDENTITY_UNCONFIGURED") {
      throw new AgenticReaderQualificationError(
        "HIVE_AGENTS_MODEL_PROVIDER and HIVE_AGENTS_MODEL_NAME are required for Reader qualification metadata.",
        "READER_MODEL_IDENTITY_UNCONFIGURED",
      );
    }
    if (message === "READER_MODEL_IDENTITY_MISMATCH") {
      throw new AgenticReaderQualificationError(
        "HIVE_AGENTS_MODEL_* must match the effective hive-agents Reader model (including Docker overrides).",
        "READER_MODEL_IDENTITY_MISMATCH",
      );
    }
    throw error;
  }
  const documentFingerprint = fingerprintRegisteredSourceDocuments(sha256Values);
  const engine = buildAgenticReaderQualificationEngineFingerprint({
    promptSha256: prompt.promptSha256,
    modelIdentity,
  });
  const idempotencyKey = computeAgenticReaderQualificationIdempotencyKey({
    caseId,
    domainId: prompt.artifact.domainId,
    domainPackId: prompt.artifact.domainPackId,
    domainPackVersion: prompt.artifact.domainPackVersion,
    documentFingerprint,
    engine,
  });

  const runRepo = new SupabaseStudyRunRepository(input.gateway, userId);
  const existing = await runRepo.getByIdempotencyKey(caseId, idempotencyKey);
  if (existing) {
    return {
      run: existing,
      idempotencyKey,
      registeredDocuments: registered.map((doc) => ({ id: doc.id, sha256: doc.sha256 })),
      prompt,
      modelIdentity,
    };
  }

  const draft = buildAgenticReaderQualificationRun({
    studyRunId: randomUUID(),
    caseId,
    idempotencyKey,
    artifact: prompt.artifact,
    prompt,
    modelIdentity,
    status: "QUEUED",
  });
  const { run } = await persistStudyRun(runRepo, draft);
  return {
    run,
    idempotencyKey,
    registeredDocuments: registered.map((doc) => ({ id: doc.id, sha256: doc.sha256 })),
    prompt,
    modelIdentity,
  };
}
