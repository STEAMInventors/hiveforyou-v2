import { describe, expect, it } from "vitest";

import type { HiveDiscoverRun } from "@hiveforyou/shared/discover";

import type { HiveGateway, HiveRow } from "./hive-gateway";
import { SupabaseDiscoverRunRepository } from "./supabase-discover";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function discoverRunsGateway(): HiveGateway {
  const rows: HiveRow[] = [];
  const matches = (row: HiveRow, where: Record<string, string | number>) =>
    Object.entries(where).every(
      ([column, value]) => String(row[column]) === String(value),
    );

  return {
    async insert(_table, row) {
      const duplicate = rows.find(
        (existing) =>
          existing.case_id === row.case_id &&
          existing.idempotency_key === row.idempotency_key,
      );
      if (duplicate) {
        throw new Error(
          "duplicate key value violates unique constraint discover_runs_case_id_idempotency_key_key",
        );
      }
      rows.push({ ...row });
    },
    async upsert() {
      throw new Error("upsert should not run");
    },
    async updateWhere(_table, row, where) {
      for (const existing of rows) {
        if (matches(existing, where)) {
          Object.assign(existing, row);
        }
      }
    },
    async selectWhere(_table, where, options) {
      let selected = rows.filter((row) => matches(row, where));
      if (options?.limit) {
        selected = selected.slice(0, options.limit);
      }
      return selected.map((row) => ({ ...row }));
    },
    async uploadObject() {
      throw new Error("unused");
    },
    async downloadObject() {
      throw new Error("unused");
    },
    async removeObject() {
      return undefined;
    },
  };
}

function storedDiscoverRow(id: string, userId: string): HiveRow {
  return {
    id,
    case_id: "case-1",
    user_id: userId,
    idempotency_key: "idem-1",
    engine_provider: "openai",
    provider_mode: "production",
    model_id: null,
    reasoning_effort: null,
    prompt_id: "discover",
    prompt_version: "v1",
    prompt_sha256: "abc",
    domain_pack_id: "unknown",
    domain_pack_version: "unknown",
    status: "FAILED",
    error_code: null,
    error_message_safe: null,
    started_at: "2026-09-28T00:00:00.000Z",
    completed_at: null,
    intake_run_id: null,
    phase: null,
  };
}

function gatewayBackedBy(rows: HiveRow[], inserts: HiveRow[]): HiveGateway {
  const matches = (row: HiveRow, where: Record<string, string | number>) =>
    Object.entries(where).every(
      ([column, value]) => String(row[column]) === String(value),
    );

  return {
    async insert(_table, row) {
      inserts.push({ ...row });
    },
    async upsert() {
      throw new Error("upsert should not run");
    },
    async updateWhere(_table, row, where) {
      const target = rows.find((existing) => matches(existing, where));
      if (!target) {
        throw new Error("update missed existing discover run");
      }
      Object.assign(target, row);
    },
    async selectWhere(table, where, options) {
      if (table === "cases") {
        if (String(where.user_id) !== USER_ID) {
          return [];
        }
        return [{ id: String(where.id), user_id: USER_ID }];
      }
      let selected = rows.filter((row) => matches(row, where));
      if (options?.limit) {
        selected = selected.slice(0, options.limit);
      }
      return selected.map((row) => ({ ...row }));
    },
    async uploadObject() {
      throw new Error("unused");
    },
    async downloadObject() {
      throw new Error("unused");
    },
    async removeObject() {
      return undefined;
    },
  };
}

function baseRun(overrides: Partial<HiveDiscoverRun> = {}): HiveDiscoverRun {
  return {
    discoverRunId: "run-a",
    caseId: "case-1",
    idempotencyKey: "idem-1",
    providerId: "openai",
    providerMode: "openai",
    promptId: "discover",
    promptVersion: "v1",
    promptSha256: "abc",
    domainPackId: "unknown",
    domainPackVersion: "unknown",
    startedAt: "2026-09-28T00:00:00.000Z",
    status: "FAILED",
    ...overrides,
  };
}

describe("SupabaseDiscoverRunRepository", () => {
  it("updates an existing run for the same case and idempotency key instead of inserting a duplicate row", async () => {
    const gateway = discoverRunsGateway();
    const repo = new SupabaseDiscoverRunRepository(gateway, USER_ID);

    await repo.save(baseRun({ discoverRunId: "run-a", status: "FAILED" }));
    await repo.save(
      baseRun({
        discoverRunId: "run-b",
        status: "SUCCEEDED",
        completedAt: "2026-09-28T01:00:00.000Z",
      }),
    );

    const persisted = await repo.getByIdempotencyKey("case-1", "idem-1");
    expect(persisted).toMatchObject({
      discoverRunId: "run-a",
      status: "SUCCEEDED",
      completedAt: "2026-09-28T01:00:00.000Z",
    });
    expect(await repo.getByDiscoverRunId("run-b")).toBeNull();
  });

  it("returns the winning run id after a concurrent insert unique-constraint race", async () => {
    const rows: HiveRow[] = [];
    const matches = (row: HiveRow, where: Record<string, string | number>) =>
      Object.entries(where).every(
        ([column, value]) => String(row[column]) === String(value),
      );

    const gateway: HiveGateway = {
      async insert(_table, row) {
        const duplicate = rows.find(
          (existing) =>
            existing.case_id === row.case_id &&
            existing.idempotency_key === row.idempotency_key,
        );
        if (duplicate) {
          throw new Error(
            "duplicate key value violates unique constraint discover_runs_case_id_idempotency_key_key",
          );
        }
        rows.push({ ...row });
      },
      async upsert() {
        throw new Error("upsert should not run");
      },
      async updateWhere(_table, row, where) {
        for (const existing of rows) {
          if (matches(existing, where)) {
            Object.assign(existing, row);
          }
        }
      },
      async selectWhere(_table, where, options) {
        let selected = rows.filter((row) => matches(row, where));
        if (options?.limit) {
          selected = selected.slice(0, options.limit);
        }
        return selected.map((row) => ({ ...row }));
      },
      async uploadObject() {
        throw new Error("unused");
      },
      async downloadObject() {
        throw new Error("unused");
      },
      async removeObject() {
        return undefined;
      },
    };

    const repo = new SupabaseDiscoverRunRepository(gateway, USER_ID);
    rows.push(storedDiscoverRow("winner", USER_ID));

    const persisted = await repo.save(
      baseRun({
        discoverRunId: "loser",
        status: "RUNNING",
        phase: "MODEL_DISCOVERY",
      }),
    );

    expect(persisted).toMatchObject({
      discoverRunId: "winner",
      phase: "MODEL_DISCOVERY",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "winner",
      phase: "MODEL_DISCOVERY",
    });
  });

  it("updates the hidden idempotency row by its database id instead of inserting another row", async () => {
    const sessionInserts: HiveRow[] = [];
    const session = gatewayBackedBy([], sessionInserts);
    const stored = storedDiscoverRow("db-run", "99999999-9999-4999-8999-999999999999");
    const adminRows = [stored];
    const admin = gatewayBackedBy(adminRows, []);
    const repo = new SupabaseDiscoverRunRepository(session, USER_ID, admin);

    await repo.save(
      baseRun({
        discoverRunId: "incoming-run",
        status: "SUCCEEDED",
        completedAt: "2026-09-28T01:00:00.000Z",
      }),
    );

    expect(sessionInserts).toHaveLength(0);
    expect(adminRows).toHaveLength(1);
    expect(adminRows[0]).toMatchObject({
      id: "db-run",
      user_id: USER_ID,
      status: "SUCCEEDED",
      idempotency_key: "idem-1",
    });
    expect(await repo.getByIdempotencyKey("case-1", "idem-1")).toMatchObject({
      discoverRunId: "db-run",
      status: "SUCCEEDED",
    });
  });
});
