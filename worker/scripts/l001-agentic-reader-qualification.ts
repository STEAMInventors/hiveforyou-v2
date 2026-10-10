import { createClient } from "@supabase/supabase-js";

import { createSupabaseHiveGateway } from "../src/persistence/hive-gateway.js";
import { ensureAgenticReaderQualificationRun } from "../src/study/ensure-agentic-reader-qualification-run.js";
import {
  runAgenticReaderQualification,
  type StudyReaderRequestWire,
  type StudyReaderResponseWire,
} from "../src/study/run-agentic-reader-qualification.js";

function readQualificationWorkerEnv(source: Record<string, string | undefined>): {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  HIVE_DOCUMENT_PAGES_BUCKET?: string;
} {
  const url = source.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = source.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRole) {
    throw new Error("WORKER_ENV_INCOMPLETE");
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: serviceRole,
    HIVE_DOCUMENT_PAGES_BUCKET: source.HIVE_DOCUMENT_PAGES_BUCKET?.trim() || undefined,
  };
}

function requireQualificationScope(env: Record<string, string | undefined>): {
  caseId: string;
  userId: string;
} {
  const caseId = env.HIVE_AGENTIC_READER_QUALIFICATION_CASE_ID?.trim();
  const userId = env.HIVE_AGENTIC_READER_QUALIFICATION_USER_ID?.trim();
  if (!caseId || !userId) {
    throw new Error(
      "HIVE_AGENTIC_READER_QUALIFICATION_CASE_ID and HIVE_AGENTIC_READER_QUALIFICATION_USER_ID are required.",
    );
  }
  return { caseId, userId };
}

function readerUrl(env: Record<string, string | undefined>): string {
  const override = env.HIVE_AGENTS_READER_URL?.trim();
  if (override) {
    return override;
  }
  const host = env.HIVE_AGENTS_BIND_HOST?.trim() || "127.0.0.1";
  const port = env.HIVE_AGENTS_BIND_PORT?.trim() || "4320";
  return `http://${host}:${port}/study/reader`;
}

async function postStudyReader(
  env: Record<string, string | undefined>,
  body: StudyReaderRequestWire,
): Promise<StudyReaderResponseWire> {
  const token = env.HIVE_AGENTS_SERVICE_TOKEN?.trim();
  if (!token) {
    throw new Error("HIVE_AGENTS_SERVICE_TOKEN is required to invoke /study/reader.");
  }
  const response = await fetch(readerUrl(env), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as StudyReaderResponseWire & {
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    const code = payload.error?.code ?? `HTTP_${response.status}`;
    throw new Error(`READER_HTTP_FAILED:${code}`);
  }
  return payload;
}

async function cmdEnsure(): Promise<void> {
  const env = process.env;
  const workerEnv = readQualificationWorkerEnv(env);
  const { caseId, userId } = requireQualificationScope(env);
  const supabase = createClient(workerEnv.NEXT_PUBLIC_SUPABASE_URL, workerEnv.SUPABASE_SERVICE_ROLE_KEY);
  const gateway = createSupabaseHiveGateway(supabase);
  const result = await ensureAgenticReaderQualificationRun({
    gateway,
    caseId,
    userId,
    env,
  });
  console.info("[l001-agentic-reader-qualification] ensure", {
    studyRunId: result.run.studyRunId,
    status: result.run.status,
    idempotencyKey: result.idempotencyKey,
    documentCount: result.registeredDocuments.length,
    promptId: result.prompt.promptId,
    promptVersion: result.prompt.promptVersion,
    modelProvider: result.modelIdentity.modelProvider,
    modelName: result.modelIdentity.modelName,
  });
}

function applyExperimentCliFlags(argv: string[]): {
  dryRun: boolean;
  live: boolean;
  architecture: string | null;
} {
  let dryRun = false;
  let live = false;
  let architecture: string | null = null;
  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i]?.trim();
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--live") {
      live = true;
    } else if (arg === "--architecture") {
      architecture = argv[++i]?.trim() ?? null;
    } else if (arg === "--variant") {
      throw new Error("--variant retired; use --architecture case_wide|parallel_document");
    }
  }
  if (architecture) {
    process.env.HIVE_READER_ARCHITECTURE_VARIANT = architecture;
    process.env.HIVE_READER_EXPERIMENT_TRUNCATE_VERIFICATION = "1";
  }
  if (live && process.env.HIVE_READER_EXPERIMENT_ALLOW_LIVE !== "1") {
    throw new Error("Live experiment blocked: set HIVE_READER_EXPERIMENT_ALLOW_LIVE=1 explicitly.");
  }
  return { dryRun, live, architecture };
}

async function cmdDryRun(): Promise<void> {
  const { execSync } = await import("node:child_process");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  execSync("pnpm --filter @hiveforyou/eval reader-experiment:dry-run", {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
}

async function cmdRun(): Promise<void> {
  const env = process.env;
  const workerEnv = readQualificationWorkerEnv(env);
  const { caseId, userId } = requireQualificationScope(env);
  const bucket =
    env.HIVE_DOCUMENT_PAGES_BUCKET?.trim() || workerEnv.HIVE_DOCUMENT_PAGES_BUCKET || "document-pages";
  const supabase = createClient(workerEnv.NEXT_PUBLIC_SUPABASE_URL, workerEnv.SUPABASE_SERVICE_ROLE_KEY);
  const gateway = createSupabaseHiveGateway(supabase);
  const outcome = await runAgenticReaderQualification({
    gateway,
    documentPagesBucket: bucket,
    caseId,
    userId,
    env,
    readerClient: (request) => postStudyReader(env, request),
  });
  console.info("[l001-agentic-reader-qualification] run", {
    outcome: outcome.outcome,
    studyRunId: outcome.run.studyRunId,
    status: outcome.run.status,
    attemptId: "attemptId" in outcome ? outcome.attemptId : undefined,
    acceptedEvidenceEvents:
      outcome.outcome === "succeeded" ? outcome.acceptedEvidenceEvents : undefined,
    errorMessage: outcome.run.errorMessage,
  });
  if (outcome.outcome === "failed") {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const command = process.argv[2]?.trim();
  const flags = applyExperimentCliFlags(process.argv);
  if (flags.dryRun) {
    await cmdDryRun();
    return;
  }
  if (command === "ensure") {
    await cmdEnsure();
    return;
  }
  if (command === "dry-run") {
    await cmdDryRun();
    return;
  }
  if (command === "run") {
    if (flags.architecture && !flags.live) {
      throw new Error("Experiment run requires --live (Anthropic) with HIVE_READER_EXPERIMENT_ALLOW_LIVE=1.");
    }
    await cmdRun();
    return;
  }
  console.error(
    "Usage: l001-agentic-reader-qualification <ensure|run|dry-run> [--architecture case_wide|parallel_document] [--dry-run] [--live DO NOT RUN without approval]",
  );
  process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[l001-agentic-reader-qualification] failed", message);
  process.exitCode = 1;
});