import { describe, expect, it, vi } from "vitest";

import { L001_READER_PACK_CONTENT_SHA256 } from "@hiveforyou/core/study";

import {
  createSupabaseDomainPackRegistryPort,
  SupabaseDomainPackRegistryRepository,
} from "./supabase-domain-pack-registry.js";
import type { HiveGateway } from "./hive-gateway.js";

function activeRow() {
  return {
    domain_id: "iep",
    pack_id: "iep",
    pack_version: "0.3.0-proposed",
    content_sha256: L001_READER_PACK_CONTENT_SHA256,
    snapshot_storage_bucket: "domain-pack-snapshots",
    snapshot_storage_path: `iep/${L001_READER_PACK_CONTENT_SHA256}.json`,
    lifecycle_status: "CERTIFIED",
    is_active: true,
    activated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("SupabaseDomainPackRegistryRepository", () => {
  it("returns the single active certified pack for a domain", async () => {
    const gateway: HiveGateway = {
      selectWhere: vi.fn(async (_table, where) => {
        if (where.domain_id === "iep") {
          return [activeRow()];
        }
        return [];
      }),
    } as unknown as HiveGateway;
    const repo = new SupabaseDomainPackRegistryRepository(gateway);
    const entry = await repo.getActiveCertifiedForDomain("iep");
    expect(entry?.contentSha256).toBe(L001_READER_PACK_CONTENT_SHA256);
  });

  it("rejects duplicate active certified rows", async () => {
    const gateway: HiveGateway = {
      selectWhere: vi.fn(async () => [activeRow(), activeRow()]),
    } as unknown as HiveGateway;
    const repo = new SupabaseDomainPackRegistryRepository(gateway);
    await expect(repo.getActiveCertifiedForDomain("iep")).rejects.toMatchObject({
      code: "DOMAIN_PACK_REGISTRY_AMBIGUOUS_ACTIVE",
    });
  });

  it("maps database failures to registry unavailable on the async port", async () => {
    const gateway: HiveGateway = {
      selectWhere: vi.fn(async () => {
        throw new Error("connection refused");
      }),
    } as unknown as HiveGateway;
    const port = createSupabaseDomainPackRegistryPort(gateway);
    await expect(port.getActiveCertifiedForDomain("iep")).rejects.toMatchObject({
      code: "DOMAIN_PACK_REGISTRY_UNAVAILABLE",
    });
  });
});
