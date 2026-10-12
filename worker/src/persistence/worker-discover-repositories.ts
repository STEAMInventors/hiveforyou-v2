import { randomUUID } from "node:crypto";

import { withSessionOwner } from "@hiveforyou/core";
import type {
  DiscoverArtifactRecord,
  DiscoverArtifactRepository,
  DiscoverRunRepository,
} from "@hiveforyou/core";
import type { HiveDiscoverRun } from "@hiveforyou/shared/discover";
import type { DocumentDiscoveryResult } from "@hiveforyou/shared/discovery";

import type { HiveGateway, HiveRow } from "./hive-gateway.js";

function text(row: HiveRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be text.`);
  }
  return value;
}

function nullableText(row: HiveRow, key: string): string | null {
  const value = row[key];
  if (value == null) {
    return null;
  }
  return String(value);
}

function mapRun(row: HiveRow): HiveDiscoverRun {
  return {
    discoverRunId: text(row, "id"),
    caseId: text(row, "case_id"),
    intakeRunId: nullableText(row, "intake_run_id") ?? undefined,
    phase: (nullableText(row, "phase") ?? undefined) as HiveDiscoverRun["phase"],
    idempotencyKey: text(row, "idempotency_key"),
    providerId: text(row, "engine_provider"),
    providerMode: text(row, "provider_mode") as HiveDiscoverRun["providerMode"],
    modelId: nullableText(row, "model_id") ?? undefined,
    reasoningEffort: nullableText(row, "reasoning_effort") ?? undefined,
    promptId: text(row, "prompt_id"),
    promptVersion: text(row, "prompt_version"),
    promptSha256: text(row, "prompt_sha256"),
    domainPackId: text(row, "domain_pack_id"),
    domainPackVersion: text(row, "domain_pack_version"),
    startedAt: text(row, "started_at"),
    completedAt: nullableText(row, "completed_at") ?? undefined,
    status: text(row, "status") as HiveDiscoverRun["status"],
    errorCode: (nullableText(row, "error_code") ?? undefined) as HiveDiscoverRun["errorCode"],
    errorMessage: nullableText(row, "error_message_safe") ?? undefined,
  };
}

export class WorkerDiscoverRunRepository implements DiscoverRunRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async save(run: HiveDiscoverRun): Promise<HiveDiscoverRun> {
    const row = withSessionOwner(this.userId, {
      id: run.discoverRunId,
      case_id: run.caseId,
      user_id: this.userId,
      idempotency_key: run.idempotencyKey,
      engine_provider: run.providerId,
      provider_mode: run.providerMode,
      model_id: run.modelId ?? null,
      reasoning_effort: run.reasoningEffort ?? null,
      prompt_id: run.promptId,
      prompt_version: run.promptVersion,
      prompt_sha256: run.promptSha256,
      domain_pack_id: run.domainPackId,
      domain_pack_version: run.domainPackVersion,
      status: run.status,
      error_code: run.errorCode ?? null,
      error_message_safe: run.errorMessage ?? null,
      started_at: run.startedAt,
      completed_at: run.completedAt ?? null,
      intake_run_id: run.intakeRunId ?? null,
      phase: run.phase ?? null,
    });
    await this.gateway.insert("discover_runs", row);
    return run;
  }

  async getByDiscoverRunId(discoverRunId: string): Promise<HiveDiscoverRun | null> {
    const rows = await this.gateway.selectWhere("discover_runs", {
      id: discoverRunId,
      user_id: this.userId,
    });
    const row = rows[0];
    return row ? mapRun(row) : null;
  }

  async getByIdempotencyKey(caseId: string, idempotencyKey: string): Promise<HiveDiscoverRun | null> {
    const rows = await this.gateway.selectWhere("discover_runs", {
      case_id: caseId,
      user_id: this.userId,
      idempotency_key: idempotencyKey,
    });
    const row = rows[0];
    return row ? mapRun(row) : null;
  }

  generateDiscoverRunId(): string {
    return randomUUID();
  }
}

export class WorkerDiscoverArtifactRepository implements DiscoverArtifactRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async save(input: DiscoverArtifactRecord): Promise<void> {
    await this.gateway.insert(
      "discover_artifacts",
      withSessionOwner(this.userId, {
        id: randomUUID(),
        discover_run_id: input.discoverRunId,
        case_id: input.caseId,
        user_id: this.userId,
        structure_map_json: input.structureMapJson ?? null,
        discovery_result_json: input.discoveryResultJson ?? null,
        created_at: new Date().toISOString(),
      }),
    );
  }

  async getByDiscoverRunId(discoverRunId: string): Promise<DiscoverArtifactRecord | null> {
    const rows = await this.gateway.selectWhere(
      "discover_artifacts",
      { discover_run_id: discoverRunId, user_id: this.userId },
      { orderBy: "created_at", ascending: false, limit: 1 },
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      discoverRunId,
      caseId: text(row, "case_id"),
      userId: this.userId,
      structureMapJson: row.structure_map_json as DiscoverArtifactRecord["structureMapJson"],
      discoveryResultJson: row.discovery_result_json as DocumentDiscoveryResult | null,
    };
  }
}
