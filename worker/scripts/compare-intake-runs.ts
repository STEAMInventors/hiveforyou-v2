import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { NORMALIZED_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/intake";

import { readWorkerEnv } from "../src/env.js";
import { createSupabaseHiveGateway } from "../src/persistence/hive-gateway.js";
import { WorkerIntakeRepository } from "../src/persistence/worker-intake-repository.js";

type RunSnapshot = {
  runId: string;
  userId: string;
  status: string;
  identities: Array<{
    sourceDocumentId: string;
    processingStatus: string;
    proposedType: string | null;
    errorCode: string | null;
  }>;
  extractions: Array<{
    sourceDocumentId: string;
    sourceHash: string;
    schemaVersion: string;
    extractorVersion: string;
    pages: Array<{ pageNumber: number; canonicalTextHash: string }>;
  }>;
  packExecutionHash: string | null;
  resolvedDomainId: string | null;
  studyPath: string | null;
};

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

async function loadRunSnapshot(
  intake: WorkerIntakeRepository,
  userId: string,
  intakeRunId: string,
  gateway: ReturnType<typeof createSupabaseHiveGateway>,
): Promise<RunSnapshot | null> {
  const run = await intake.getById(userId, intakeRunId);
  if (!run) {
    return null;
  }
  const identities = await intake.listByRun(userId, intakeRunId);
  const extractions: RunSnapshot["extractions"] = [];
  for (const identity of identities) {
    const sourceRows = await gateway.selectWhere(
      "source_documents",
      { id: identity.sourceDocumentId, user_id: userId },
      { limit: 1 },
    );
    const sha256 = sourceRows[0]?.sha256 ? String(sourceRows[0].sha256) : "";
    if (!sha256) {
      continue;
    }
    const normalized = await intake.getBySourceHash(userId, identity.sourceDocumentId, sha256);
    if (
      !normalized ||
      normalized.schemaVersion !== NORMALIZED_EXTRACTION_SCHEMA_VERSION ||
      normalized.normalizedExtraction.schemaVersion !== NORMALIZED_EXTRACTION_SCHEMA_VERSION
    ) {
      continue;
    }
    extractions.push({
      sourceDocumentId: identity.sourceDocumentId,
      sourceHash: sha256,
      schemaVersion: normalized.schemaVersion,
      extractorVersion: normalized.normalizedExtraction.extractorVersion,
      pages: normalized.normalizedExtraction.pages.map((page) => ({
        pageNumber: page.pageNumber,
        canonicalTextHash: hashText(page.canonicalText),
      })),
    });
  }

  return {
    runId: run.id,
    userId: run.userId,
    status: run.status,
    identities: identities.map((row) => ({
      sourceDocumentId: row.sourceDocumentId,
      processingStatus: row.processingStatus,
      proposedType: row.proposedType,
      errorCode: row.errorCode,
    })),
    extractions,
    packExecutionHash: run.packExecutionJson ? hashJson(JSON.parse(run.packExecutionJson)) : null,
    resolvedDomainId: run.resolvedDomainId,
    studyPath: run.studyPath,
  };
}

function diffSnapshots(left: RunSnapshot, right: RunSnapshot): Record<string, unknown> {
  const identityDiff = left.identities.filter((row) => {
    const other = right.identities.find((item) => item.sourceDocumentId === row.sourceDocumentId);
    return (
      !other ||
      other.processingStatus !== row.processingStatus ||
      other.proposedType !== row.proposedType ||
      other.errorCode !== row.errorCode
    );
  });

  const extractionDiff = left.extractions.filter((row) => {
    const other = right.extractions.find((item) => item.sourceDocumentId === row.sourceDocumentId);
    if (!other) {
      return true;
    }
    return (
      other.sourceHash !== row.sourceHash ||
      other.extractorVersion !== row.extractorVersion ||
      hashJson(other.pages) !== hashJson(row.pages)
    );
  });

  return {
    run: {
      status: left.status === right.status ? "match" : { left: left.status, right: right.status },
      resolvedDomainId:
        left.resolvedDomainId === right.resolvedDomainId
          ? "match"
          : { left: left.resolvedDomainId, right: right.resolvedDomainId },
      studyPath:
        left.studyPath === right.studyPath ? "match" : { left: left.studyPath, right: right.studyPath },
      packExecutionHash:
        left.packExecutionHash === right.packExecutionHash
          ? "match"
          : { left: left.packExecutionHash, right: right.packExecutionHash },
    },
    identities: identityDiff,
    extractions: extractionDiff.map((row) => ({
      sourceDocumentId: row.sourceDocumentId,
      sourceHash: row.sourceHash,
      extractorVersion: row.extractorVersion,
      pageHashes: row.pages.map((page) => ({
        pageNumber: page.pageNumber,
        canonicalTextHash: page.canonicalTextHash,
      })),
    })),
  };
}

async function resolveRunUserId(
  gateway: ReturnType<typeof createSupabaseHiveGateway>,
  intakeRunId: string,
): Promise<string | null> {
  const rows = await gateway.selectWhere("intake_runs", { id: intakeRunId }, { limit: 1 });
  return rows[0]?.user_id ? String(rows[0].user_id) : null;
}

async function main(): Promise<void> {
  const [runA, runB] = process.argv.slice(2);
  if (!runA?.trim() || !runB?.trim()) {
    console.error("Usage: compare-intake-runs <runA> <runB>");
    process.exit(1);
  }

  const env = readWorkerEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const gateway = createSupabaseHiveGateway(supabase);

  const userA = await resolveRunUserId(gateway, runA.trim());
  const userB = await resolveRunUserId(gateway, runB.trim());
  if (!userA || !userB) {
    throw new Error("INTAKE_RUN_NOT_FOUND");
  }
  if (userA !== userB) {
    throw new Error("RUN_USER_MISMATCH");
  }

  const intake = new WorkerIntakeRepository(gateway, userA);
  const left = await loadRunSnapshot(intake, userA, runA.trim(), gateway);
  const right = await loadRunSnapshot(intake, userA, runB.trim(), gateway);
  if (!left || !right) {
    throw new Error("INTAKE_RUN_NOT_FOUND");
  }

  const diff = diffSnapshots(left, right);
  const matched =
    (diff.identities as unknown[]).length === 0 &&
    (diff.extractions as unknown[]).length === 0 &&
    (diff.run as { status: string }).status === "match" &&
    (diff.run as { packExecutionHash: string }).packExecutionHash === "match";

  console.info(
    JSON.stringify(
      {
        matched,
        leftRunId: left.runId,
        rightRunId: right.runId,
        diff,
      },
      null,
      2,
    ),
  );
  process.exit(matched ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
