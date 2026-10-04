import { withSessionOwner } from "@hiveforyou/core";
import type {
  DiscoverArtifactRecord,
  DiscoverArtifactRepository,
  DiscoverRunRepository,
} from "@hiveforyou/core";
import type { HiveDiscoverRun } from "@hiveforyou/shared/discover";
import type { DocumentDiscoveryResult } from "@hiveforyou/shared/discovery";

import type { HiveGateway, HiveRow } from "./hive-gateway";

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

function runToRow(run: HiveDiscoverRun, userId: string): HiveRow {
  return withSessionOwner(userId, {
    id: run.discoverRunId,
    case_id: run.caseId,
    user_id: userId,
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
}

function mapRun(row: HiveRow): HiveDiscoverRun {
  return {
    discoverRunId: text(row, "id"),
    caseId: text(row, "case_id"),
    intakeRunId: nullableText(row, "intake_run_id"),
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

type LocatedDiscoverRun = {
  run: HiveDiscoverRun;
  writeGateway: HiveGateway;
  where: Record<string, string>;
  lookup: "session" | "session-key" | "service-role";
};

function isIdempotencyConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (message.includes("discover_runs_case_id_idempotency_key_key")) {
    return true;
  }
  if (message.includes("23505")) {
    return true;
  }
  return lower.includes("duplicate key") && lower.includes("idempotency");
}

function persistedRunFromLocated(
  run: HiveDiscoverRun,
  located: LocatedDiscoverRun,
): HiveDiscoverRun {
  return {
    ...run,
    discoverRunId: located.run.discoverRunId,
    startedAt: located.run.startedAt,
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class SupabaseDiscoverRunRepository implements DiscoverRunRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
    private readonly adminGateway?: HiveGateway,
  ) {}

  async save(run: HiveDiscoverRun): Promise<HiveDiscoverRun> {
    const located = await this.locateByIdempotencyKey(run.caseId, run.idempotencyKey);
    if (located) {
      await this.updateExisting(located, run);
      return persistedRunFromLocated(run, located);
    }
    try {
      await this.gateway.insert("discover_runs", runToRow(run, this.userId));
      const inserted = await this.locateByIdempotencyKey(run.caseId, run.idempotencyKey);
      if (inserted) {
        return persistedRunFromLocated(run, inserted);
      }
      return run;
    } catch (error) {
      if (!isIdempotencyConflict(error)) {
        throw error;
      }
      const raced = await this.locateByIdempotencyKeyAfterInsertRace(
        run.caseId,
        run.idempotencyKey,
      );
      if (!raced) {
        throw error;
      }
      await this.updateExisting(raced, run);
      return persistedRunFromLocated(run, raced);
    }
  }

  private async locateByIdempotencyKeyAfterInsertRace(
    caseId: string,
    idempotencyKey: string,
  ): Promise<LocatedDiscoverRun | null> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const located = await this.locateByIdempotencyKey(caseId, idempotencyKey);
      if (located) {
        return located;
      }
      if (attempt < 4) {
        await sleep(25 * (attempt + 1));
      }
    }
    return null;
  }

  private async updateExisting(located: LocatedDiscoverRun, run: HiveDiscoverRun): Promise<void> {
    const persistedRun: HiveDiscoverRun = {
      ...run,
      discoverRunId: located.run.discoverRunId,
      startedAt: located.run.startedAt,
    };
    const row = runToRow(persistedRun, this.userId);
    delete row.id;
    await located.writeGateway.updateWhere("discover_runs", row, located.where);
  }

  async getByDiscoverRunId(discoverRunId: string): Promise<HiveDiscoverRun | null> {
    const rows = await this.gateway.selectWhere(
      "discover_runs",
      { id: discoverRunId, user_id: this.userId },
      { limit: 1 },
    );
    return rows[0] ? mapRun(rows[0]) : null;
  }

  async getByIdempotencyKey(
    caseId: string,
    idempotencyKey: string,
  ): Promise<HiveDiscoverRun | null> {
    const located = await this.locateByIdempotencyKey(caseId, idempotencyKey);
    return located?.run ?? null;
  }

  private async locateByIdempotencyKey(
    caseId: string,
    idempotencyKey: string,
  ): Promise<LocatedDiscoverRun | null> {
    const owned = await this.gateway.selectWhere(
      "discover_runs",
      { case_id: caseId, idempotency_key: idempotencyKey, user_id: this.userId },
      { limit: 1 },
    );
    if (owned[0]) {
      const run = mapRun(owned[0]);
      return {
        run,
        writeGateway: this.gateway,
        where: { id: run.discoverRunId, user_id: this.userId },
        lookup: "session",
      };
    }

    const visible = await this.gateway.selectWhere(
      "discover_runs",
      { case_id: caseId, idempotency_key: idempotencyKey },
      { limit: 1 },
    );
    if (visible[0] && text(visible[0], "user_id") === this.userId) {
      const run = mapRun(visible[0]);
      return {
        run,
        writeGateway: this.gateway,
        where: { id: run.discoverRunId, user_id: this.userId },
        lookup: "session-key",
      };
    }

    if (!this.adminGateway) {
      return null;
    }
    const caseRows = await this.gateway.selectWhere(
      "cases",
      { id: caseId, user_id: this.userId },
      { limit: 1 },
    );
    if (!caseRows[0]) {
      return null;
    }
    const hidden = await this.adminGateway.selectWhere(
      "discover_runs",
      { case_id: caseId, idempotency_key: idempotencyKey },
      { limit: 1 },
    );
    if (!hidden[0]) {
      return null;
    }
    const run = mapRun(hidden[0]);
    return {
      run,
      writeGateway: this.adminGateway,
      where: {
        id: run.discoverRunId,
        case_id: caseId,
        idempotency_key: idempotencyKey,
      },
      lookup: "service-role",
    };
  }
}

export class SupabaseDiscoverArtifactRepository implements DiscoverArtifactRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async save(input: DiscoverArtifactRecord): Promise<void> {
    const existing = await this.getByDiscoverRunId(input.discoverRunId);
    const merged: DiscoverArtifactRecord = {
      ...existing,
      ...input,
      discoverRunId: input.discoverRunId,
      caseId: input.caseId,
      userId: input.userId,
    };
    if (existing) {
      await this.gateway.updateWhere(
        "discover_artifacts",
        {
          raw_proposal_json: merged.rawProposalJson ?? null,
          validation_result_json: merged.validationResultJson ?? null,
          discovery_result_json: merged.discoveryResultJson ?? null,
          structure_map_json: merged.structureMapJson ?? null,
          discovery_assessment_json: merged.discoveryAssessmentJson ?? null,
          resolution_proposal_json: merged.resolutionProposalJson ?? null,
        },
        { discover_run_id: input.discoverRunId, user_id: this.userId },
      );
      return;
    }
    await this.gateway.insert(
      "discover_artifacts",
      withSessionOwner(this.userId, {
        discover_run_id: merged.discoverRunId,
        case_id: merged.caseId,
        user_id: this.userId,
        raw_proposal_json: merged.rawProposalJson ?? null,
        validation_result_json: merged.validationResultJson ?? null,
        discovery_result_json: merged.discoveryResultJson ?? null,
        structure_map_json: merged.structureMapJson ?? null,
        discovery_assessment_json: merged.discoveryAssessmentJson ?? null,
        resolution_proposal_json: merged.resolutionProposalJson ?? null,
      }),
    );
  }

  async getByDiscoverRunId(discoverRunId: string): Promise<DiscoverArtifactRecord | null> {
    const rows = await this.gateway.selectWhere(
      "discover_artifacts",
      { discover_run_id: discoverRunId, user_id: this.userId },
      { limit: 1 },
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      discoverRunId,
      caseId: text(row, "case_id"),
      userId: this.userId,
      rawProposalJson: row.raw_proposal_json,
      validationResultJson: row.validation_result_json,
      discoveryResultJson: row.discovery_result_json,
      structureMapJson: row.structure_map_json,
      discoveryAssessmentJson: row.discovery_assessment_json,
      resolutionProposalJson: row.resolution_proposal_json,
    };
  }

  async getDiscoveryResultByRunId(
    discoverRunId: string,
  ): Promise<DocumentDiscoveryResult | null> {
    const rows = await this.gateway.selectWhere(
      "discover_artifacts",
      { discover_run_id: discoverRunId, user_id: this.userId },
      { limit: 1 },
    );
    const row = rows[0];
    if (!row?.discovery_result_json) {
      return null;
    }
    return row.discovery_result_json as DocumentDiscoveryResult;
  }
}
