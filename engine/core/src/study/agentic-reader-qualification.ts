import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";

import { hashCanonicalJson } from "./fingerprint";

export const AGENTIC_READER_QUALIFICATION_NAMESPACE = "agentic-reader-qualification/1" as const;

export const AGENTIC_READER_QUALIFICATION_QUESTION_SET_VERSION =
  "agentic-reader-qualification/1" as const;

/** Pinned L001 qualification corpus SHA-256 values (eight documents). */
export const L001_QUALIFICATION_SOURCE_SHA256 = [
  "8ae4ac0ce3009151dea07f9751e65fab11d9147a67f2eec2f5f1ecd09be4629d",
  "ffd4ebe21c06d6e365d9d581b996e17a79a7f81207722e83b1c1005dc70935c6",
  "864013b7e57a576ce6587589c67baa03003cf56c7cf0fb4fc01c2f6b43aded9c",
  "7496e950f951b666a7d532ad8c8d782946b60688650084c84b5ebebf9b17ef7d",
  "5fde3e11eaeb224daa7df5a61e72dd9d351dc6c02ee634e5ee51ee478449ec3f",
  "8adc5107634a1be4ab7d9b4f0817b0f254331ce1598de4ac5a859d1257e810fd",
  "35b0594bbbbc68239a3dad3a657290b1ea08093e2290a0d093ef716ca1c72ba2",
  "1e6b380e4a348029a97d1648228530b8cb060609c1ec30404cc43545d9833e2c",
] as const;

export type StudyAgentsExportArtifact = {
  schemaVersion: "study-agents/1";
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  agents: {
    intake: string;
    reader: string;
    investigator: string;
    writer: string;
  };
};

export type AgenticReaderPromptMetadata = {
  promptId: string;
  promptVersion: string;
  promptSha256: string;
  agentsJsonPath: string;
  artifact: StudyAgentsExportArtifact;
};

export type AgenticReaderModelIdentity = {
  modelProvider: string;
  modelName: string;
  providerId: string;
  providerMode: CanonicalStudyRun["providerMode"];
};

export type AgenticReaderQualificationEngineFingerprint = {
  namespace: typeof AGENTIC_READER_QUALIFICATION_NAMESPACE;
  modelProvider: string;
  modelName: string;
  promptSha256: string;
};

export const AGENTIC_READER_QUALIFICATION_ANSWER_SNAPSHOT_HASH = hashCanonicalJson({
  schemaVersion: AGENTIC_READER_QUALIFICATION_NAMESPACE,
  answers: {},
});

const CORE_REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

export function defaultStudyAgentsJsonPath(domainId = "iep"): string {
  return join(CORE_REPO_ROOT, "engine", "domain-packs", domainId, "study", "agents.json");
}

export function resolveStudyAgentsJsonPath(
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env.HIVE_AGENTS_JSON?.trim();
  return override || defaultStudyAgentsJsonPath("iep");
}

function parseStudyAgentsExport(raw: string, path: string): StudyAgentsExportArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`AGENTS_JSON_INVALID: ${path}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`AGENTS_JSON_INVALID: ${path}`);
  }
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== "study-agents/1") {
    throw new Error(`AGENTS_JSON_SCHEMA_UNSUPPORTED: ${path}`);
  }
  for (const key of ["domainId", "domainPackId", "domainPackVersion"] as const) {
    if (typeof record[key] !== "string" || !String(record[key]).trim()) {
      throw new Error(`AGENTS_JSON_MISSING_${key.toUpperCase()}: ${path}`);
    }
  }
  const agents = record.agents;
  if (!agents || typeof agents !== "object") {
    throw new Error(`AGENTS_JSON_MISSING_AGENTS: ${path}`);
  }
  for (const role of ["intake", "reader", "investigator", "writer"] as const) {
    const value = (agents as Record<string, unknown>)[role];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`AGENTS_JSON_MISSING_READER_INSTRUCTIONS: ${path}`);
    }
  }
  return parsed as StudyAgentsExportArtifact;
}

export function sha256HexOfUtf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function loadEffectiveStudyAgentsPromptMetadata(input?: {
  agentsJsonPath?: string;
  env?: Record<string, string | undefined>;
}): AgenticReaderPromptMetadata {
  const env = input?.env ?? process.env;
  const agentsJsonPath = input?.agentsJsonPath ?? resolveStudyAgentsJsonPath(env);
  const raw = readFileSync(agentsJsonPath, "utf8");
  const artifact = parseStudyAgentsExport(raw, agentsJsonPath);
  const promptSha256 = sha256HexOfUtf8(raw);
  const promptId = `study-agents/${artifact.domainId}/reader`;
  const promptVersion = `${artifact.schemaVersion}+${artifact.domainPackVersion}`;
  return {
    promptId,
    promptVersion,
    promptSha256,
    agentsJsonPath,
    artifact,
  };
}

const DEFAULT_HIVE_AGENTS_CONFIG_MODEL_PROVIDER = "anthropic";
const DEFAULT_HIVE_AGENTS_CONFIG_MODEL_NAME = "claude-opus-5-5";

/**
 * Effective hive-agents Reader model after Docker Compose env merge on Oracle.
 * Later layers win: agents.config.env < shared worker.env on the agents container < compose `environment`.
 * hive-worker v4 MODEL_* keys are intentionally excluded.
 */
export function resolveEffectiveHiveAgentsModelIdentity(
  env: Record<string, string | undefined> = process.env,
): Pick<AgenticReaderModelIdentity, "modelProvider" | "modelName"> {
  let modelProvider =
    env.HIVE_AGENTS_CONFIG_MODEL_PROVIDER?.trim()?.toLowerCase() ||
    DEFAULT_HIVE_AGENTS_CONFIG_MODEL_PROVIDER;
  let modelName =
    env.HIVE_AGENTS_CONFIG_MODEL_NAME?.trim() || DEFAULT_HIVE_AGENTS_CONFIG_MODEL_NAME;

  const containerProvider = env.HIVE_AGENTS_CONTAINER_MODEL_PROVIDER?.trim();
  const containerName = env.HIVE_AGENTS_CONTAINER_MODEL_NAME?.trim();
  if (containerProvider) {
    modelProvider = containerProvider.toLowerCase();
  }
  if (containerName) {
    modelName = containerName;
  }

  const composeProvider = env.HIVE_AGENTS_DOCKER_COMPOSE_MODEL_PROVIDER?.trim();
  const composeName = env.HIVE_AGENTS_DOCKER_COMPOSE_MODEL_NAME?.trim();
  if (composeProvider) {
    modelProvider = composeProvider.toLowerCase();
  }
  if (composeName) {
    modelName = composeName;
  }

  return { modelProvider, modelName };
}

function providerModeForHiveAgentsModel(
  modelProvider: string,
): CanonicalStudyRun["providerMode"] {
  const normalizedProvider = modelProvider.toLowerCase();
  if (normalizedProvider === "anthropic") {
    return "anthropic";
  }
  if (normalizedProvider === "openai") {
    return "openai";
  }
  if (normalizedProvider === "fixture") {
    return "fixture";
  }
  return "unconfigured";
}

/** Qualification metadata uses hive-agents Reader model env, not hive-worker v4 MODEL_* keys. */
export function resolveAgenticReaderModelIdentity(
  env: Record<string, string | undefined> = process.env,
): AgenticReaderModelIdentity {
  const configuredProvider = env.HIVE_AGENTS_MODEL_PROVIDER?.trim();
  const configuredName = env.HIVE_AGENTS_MODEL_NAME?.trim();
  if (!configuredProvider || !configuredName) {
    throw new Error("READER_MODEL_IDENTITY_UNCONFIGURED");
  }

  const effective = resolveEffectiveHiveAgentsModelIdentity(env);
  const normalizedConfiguredProvider = configuredProvider.toLowerCase();
  if (
    normalizedConfiguredProvider !== effective.modelProvider ||
    configuredName !== effective.modelName
  ) {
    throw new Error("READER_MODEL_IDENTITY_MISMATCH");
  }

  return {
    modelProvider: normalizedConfiguredProvider,
    modelName: configuredName,
    providerId: `hive-agents-${normalizedConfiguredProvider}`,
    providerMode: providerModeForHiveAgentsModel(normalizedConfiguredProvider),
  };
}

export function fingerprintRegisteredSourceDocuments(
  sha256Values: readonly string[],
): string {
  const sorted = [...sha256Values].map((value) => value.toLowerCase()).sort();
  return hashCanonicalJson({ sha256: sorted });
}

export function fingerprintL001QualificationCorpus(): string {
  return fingerprintRegisteredSourceDocuments(L001_QUALIFICATION_SOURCE_SHA256);
}

export function computeAgenticReaderQualificationIdempotencyKey(input: {
  caseId: string;
  domainId: string;
  domainPackId: string;
  domainPackVersion: string;
  documentFingerprint: string;
  engine: AgenticReaderQualificationEngineFingerprint;
}): string {
  return hashCanonicalJson({
    namespace: AGENTIC_READER_QUALIFICATION_NAMESPACE,
    caseId: input.caseId,
    domainId: input.domainId,
    domainPackId: input.domainPackId,
    domainPackVersion: input.domainPackVersion,
    documentFingerprint: input.documentFingerprint,
    engine: input.engine,
  });
}

export function buildAgenticReaderQualificationEngineFingerprint(input: {
  promptSha256: string;
  modelIdentity: AgenticReaderModelIdentity;
}): AgenticReaderQualificationEngineFingerprint {
  return {
    namespace: AGENTIC_READER_QUALIFICATION_NAMESPACE,
    modelProvider: input.modelIdentity.modelProvider,
    modelName: input.modelIdentity.modelName,
    promptSha256: input.promptSha256,
  };
}

export type BuildAgenticReaderQualificationRunInput = {
  studyRunId?: string;
  caseId: string;
  idempotencyKey: string;
  artifact: StudyAgentsExportArtifact;
  prompt: Pick<AgenticReaderPromptMetadata, "promptId" | "promptVersion" | "promptSha256">;
  modelIdentity: AgenticReaderModelIdentity;
  status?: CanonicalStudyRun["status"];
  startedAt?: string;
};

export function buildAgenticReaderQualificationRun(
  input: BuildAgenticReaderQualificationRunInput,
): CanonicalStudyRun {
  const studyRunId = input.studyRunId ?? randomUUID();
  const startedAt = input.startedAt ?? new Date().toISOString();
  return {
    studyRunId,
    caseId: input.caseId,
    idempotencyKey: input.idempotencyKey,
    studyContextId: studyRunId,
    domainId: input.artifact.domainId,
    domainPackId: input.artifact.domainPackId,
    domainPackVersion: input.artifact.domainPackVersion,
    questionSetVersion: AGENTIC_READER_QUALIFICATION_QUESTION_SET_VERSION,
    answerSnapshotHash: AGENTIC_READER_QUALIFICATION_ANSWER_SNAPSHOT_HASH,
    providerId: input.modelIdentity.providerId,
    providerMode: input.modelIdentity.providerMode,
    promptId: input.prompt.promptId,
    promptVersion: input.prompt.promptVersion,
    promptSha256: input.prompt.promptSha256,
    startedAt,
    status: input.status ?? "QUEUED",
  };
}

export function assertL001QualificationDocumentScope(
  registeredSha256: readonly string[],
): void {
  const expected = new Set(
    L001_QUALIFICATION_SOURCE_SHA256.map((value) => value.toLowerCase()),
  );
  const actual = new Set(registeredSha256.map((value) => value.toLowerCase()));
  if (actual.size !== expected.size) {
    throw new Error("L001_QUALIFICATION_DOCUMENT_SCOPE_MISMATCH");
  }
  for (const hash of expected) {
    if (!actual.has(hash)) {
      throw new Error("L001_QUALIFICATION_DOCUMENT_SCOPE_MISMATCH");
    }
  }
}
