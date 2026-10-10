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

export const READER_ARCHITECTURE_VARIANTS = ["case_wide", "parallel_document"] as const;

export type ReaderArchitectureVariant = (typeof READER_ARCHITECTURE_VARIANTS)[number];

/** 1 list + 8 read_pages (L001) + verifier buffer — matches Python READER_EXPERIMENT_L001_LIMITS. */
export const READER_EXPERIMENT_L001_MAX_TOOL_CALLS = 165;
export const READER_EXPERIMENT_L001_MAX_REASONING_STEPS = 4;

export type ReaderExperimentPromptHashes = {
  promptVersion: string;
  sharedPromptSha256: string;
};

export function readerExperimentPromptHashesPath(
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env.HIVE_READER_EXPERIMENT_PROMPT_HASHES_JSON?.trim();
  if (override) {
    return override;
  }
  return join(CORE_REPO_ROOT, "engine", "eval", "reports", "reader-experiment", "prompt-hashes.json");
}

/** Fail closed when Oracle/worker image sets HIVE_READER_EXPERIMENT_PROMPT_HASHES_JSON. */
export function verifyReaderExperimentPromptHashesPackaged(
  env: Record<string, string | undefined> = process.env,
): void {
  const override = env.HIVE_READER_EXPERIMENT_PROMPT_HASHES_JSON?.trim();
  if (!override) {
    return;
  }
  loadReaderExperimentPromptHashes(env);
}

export function loadReaderExperimentPromptHashes(
  env: Record<string, string | undefined> = process.env,
): ReaderExperimentPromptHashes {
  const path = readerExperimentPromptHashesPath(env);
  const parsed = JSON.parse(readFileSync(path, "utf8")) as ReaderExperimentPromptHashes;
  for (const key of ["promptVersion", "sharedPromptSha256"] as const) {
    if (typeof parsed[key] !== "string" || !parsed[key].trim()) {
      throw new Error(`READER_EXPERIMENT_PROMPT_HASHES_INVALID:${path}:${key}`);
    }
  }
  return parsed;
}

export function resolveReaderArchitectureVariant(
  env: Record<string, string | undefined> = process.env,
): ReaderArchitectureVariant | null {
  const legacy = env.HIVE_READER_EXPERIMENT_VARIANT?.trim();
  if (legacy) {
    throw new Error(
      "READER_EXPERIMENT_VARIANT_RETIRED: use HIVE_READER_ARCHITECTURE_VARIANT=case_wide|parallel_document",
    );
  }
  const raw = env.HIVE_READER_ARCHITECTURE_VARIANT?.trim();
  if (!raw) {
    return null;
  }
  if (!(READER_ARCHITECTURE_VARIANTS as readonly string[]).includes(raw)) {
    throw new Error(`READER_ARCHITECTURE_VARIANT_UNSUPPORTED:${raw}`);
  }
  return raw as ReaderArchitectureVariant;
}

/** @deprecated Use resolveReaderArchitectureVariant */
export function resolveReaderExperimentVariant(
  env: Record<string, string | undefined> = process.env,
): ReaderArchitectureVariant | null {
  return resolveReaderArchitectureVariant(env);
}

/** Qualification prompt metadata — experiment variant overrides pack reader hash when env set. */
export function loadAgenticReaderQualificationPromptMetadata(input?: {
  agentsJsonPath?: string;
  env?: Record<string, string | undefined>;
}): AgenticReaderPromptMetadata {
  const env = input?.env ?? process.env;
  const architecture = resolveReaderArchitectureVariant(env);
  const base = loadEffectiveStudyAgentsPromptMetadata(input);
  if (!architecture) {
    return base;
  }
  const hashes = loadReaderExperimentPromptHashes(env);
  return {
    promptId: `reader-experiment/architecture/${architecture}`,
    promptVersion: `${hashes.promptVersion}+${architecture}`,
    promptSha256: hashes.sharedPromptSha256,
    agentsJsonPath: base.agentsJsonPath,
    artifact: base.artifact,
  };
}

export type L001QualificationManifestFile = {
  filename: string;
  sha256: string;
  sourceDocumentId?: string;
};

export type L001QualificationManifest = {
  sourceIdPrefix?: string;
  files: L001QualificationManifestFile[];
};

export function l001QualificationManifestPath(
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env.HIVE_L001_QUALIFICATION_MANIFEST_JSON?.trim();
  if (override) {
    return override;
  }
  return join(CORE_REPO_ROOT, "engine", "intake", "fixtures", "l001", "manifest.json");
}

/** Validates committed L001 qualification manifest shape and SHA-256 pins (eight documents). */
export function parseAndValidateL001QualificationManifest(
  raw: string,
  path: string,
): L001QualificationManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`L001_QUALIFICATION_MANIFEST_INVALID:${path}:json`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`L001_QUALIFICATION_MANIFEST_INVALID:${path}:shape`);
  }
  const filesRaw = (parsed as { files?: unknown }).files;
  if (!Array.isArray(filesRaw) || filesRaw.length !== L001_QUALIFICATION_SOURCE_SHA256.length) {
    throw new Error(`L001_QUALIFICATION_MANIFEST_INVALID:${path}:files`);
  }
  const filenameByHash = new Map<string, string>();
  for (const entry of filesRaw) {
    if (!entry || typeof entry !== "object") {
      throw new Error(`L001_QUALIFICATION_MANIFEST_INVALID:${path}:file_entry`);
    }
    const record = entry as Record<string, unknown>;
    const filename = record.filename;
    const sha256 = record.sha256;
    if (typeof filename !== "string" || !filename.trim()) {
      throw new Error(`L001_QUALIFICATION_MANIFEST_INVALID:${path}:filename`);
    }
    if (typeof sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(sha256.trim())) {
      throw new Error(`L001_QUALIFICATION_MANIFEST_INVALID:${path}:sha256`);
    }
    const normalized = sha256.toLowerCase();
    if (filenameByHash.has(normalized)) {
      throw new Error(`L001_QUALIFICATION_MANIFEST_INVALID:${path}:duplicate_sha256`);
    }
    filenameByHash.set(normalized, filename);
  }
  const expected = new Set(
    L001_QUALIFICATION_SOURCE_SHA256.map((value) => value.toLowerCase()),
  );
  if (filenameByHash.size !== expected.size) {
    throw new Error(`L001_QUALIFICATION_MANIFEST_PIN_MISMATCH:${path}`);
  }
  for (const hash of expected) {
    if (!filenameByHash.has(hash)) {
      throw new Error(`L001_QUALIFICATION_MANIFEST_PIN_MISMATCH:${path}`);
    }
  }
  for (const hash of filenameByHash.keys()) {
    if (!expected.has(hash)) {
      throw new Error(`L001_QUALIFICATION_MANIFEST_PIN_MISMATCH:${path}`);
    }
  }
  return parsed as L001QualificationManifest;
}

export function loadL001QualificationManifest(
  env: Record<string, string | undefined> = process.env,
): L001QualificationManifest {
  const path = l001QualificationManifestPath(env);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno?.code === "ENOENT") {
      throw new Error(`L001_QUALIFICATION_MANIFEST_MISSING:${path}`);
    }
    throw error;
  }
  return parseAndValidateL001QualificationManifest(raw, path);
}

/** Fail closed when Oracle/worker image sets HIVE_L001_QUALIFICATION_MANIFEST_JSON. */
export function verifyL001QualificationManifestPackaged(
  env: Record<string, string | undefined> = process.env,
): void {
  const override = env.HIVE_L001_QUALIFICATION_MANIFEST_JSON?.trim();
  if (!override) {
    return;
  }
  loadL001QualificationManifest(env);
}

/** Map persisted sourceDocumentId → golden corpus filename via SHA-256 pins. */
export function buildL001QualificationSourceDocumentIdToFilename(
  registered: ReadonlyArray<{ id: string; sha256: string }>,
  env: Record<string, string | undefined> = process.env,
): Map<string, string> {
  const manifest = loadL001QualificationManifest(env);
  const filenameByHash = new Map<string, string>();
  for (const file of manifest.files) {
    filenameByHash.set(file.sha256.toLowerCase(), file.filename);
  }
  const map = new Map<string, string>();
  for (const doc of registered) {
    const filename = filenameByHash.get(doc.sha256.toLowerCase());
    if (filename) {
      map.set(doc.id, filename);
    }
  }
  if (map.size !== L001_QUALIFICATION_SOURCE_SHA256.length) {
    throw new Error("L001_QUALIFICATION_SOURCE_DOCUMENT_FILENAME_MAP_INCOMPLETE");
  }
  return map;
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
  readerArchitectureVariant?: ReaderArchitectureVariant | null;
}): AgenticReaderQualificationEngineFingerprint {
  const base = {
    namespace: AGENTIC_READER_QUALIFICATION_NAMESPACE,
    modelProvider: input.modelIdentity.modelProvider,
    modelName: input.modelIdentity.modelName,
    promptSha256: input.promptSha256,
  };
  if (!input.readerArchitectureVariant) {
    return base;
  }
  return {
    ...base,
    promptSha256: hashCanonicalJson({
      promptSha256: input.promptSha256,
      readerArchitectureVariant: input.readerArchitectureVariant,
    }),
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
