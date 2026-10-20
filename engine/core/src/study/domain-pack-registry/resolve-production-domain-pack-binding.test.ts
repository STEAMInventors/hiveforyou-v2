import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { DomainPackRegistryEntry } from "@hiveforyou/shared/domain-pack-registry";

import { L001_READER_PACK_CONTENT_SHA256 } from "../resolve-canonical-study-interpretation.js";
import { hiveMonorepoRoot } from "../resolve-hive-monorepo-root.js";
import { createAsyncDomainPackRegistryPortFromSync } from "./async-domain-pack-registry-port.js";
import { DomainPackRegistryError } from "./errors.js";
import { createInMemoryDomainPackRegistry } from "./resolve-domain-pack-registry.js";
import { resolveProductionDomainPackBindingForStudyStart } from "./resolve-production-domain-pack-binding.js";

const ACTIVE: DomainPackRegistryEntry = {
  domainId: "iep",
  packId: "iep",
  packVersion: "0.3.0-proposed",
  contentSha256: L001_READER_PACK_CONTENT_SHA256,
  snapshotStorageBucket: "domain-pack-snapshots",
  snapshotStoragePath: `iep/${L001_READER_PACK_CONTENT_SHA256}.json`,
  lifecycleStatus: "CERTIFIED",
  isActive: true,
  activatedAt: "2026-01-01T00:00:00.000Z",
};

function l001SnapshotRaw(): string {
  return readFileSync(
    join(
      hiveMonorepoRoot(),
      "brain",
      "domain-packs",
      "iep",
      "snapshots",
      `${L001_READER_PACK_CONTENT_SHA256}.json`,
    ),
    "utf8",
  );
}

describe("resolveProductionDomainPackBindingForStudyStart", () => {
  it("selects active certified pack and verifies snapshot digest", async () => {
    const registry = createAsyncDomainPackRegistryPortFromSync(
      createInMemoryDomainPackRegistry([ACTIVE]),
    );
    const binding = await resolveProductionDomainPackBindingForStudyStart({
      domainId: "iep",
      registry,
      readSnapshotBytes: async () => l001SnapshotRaw(),
    });
    expect(binding.selectionMode).toBe("production_active_certified");
    expect(binding.verifiedContentSha256).toBe(L001_READER_PACK_CONTENT_SHA256);
  });

  it("preserves historical study pins without selecting a newer active pack", async () => {
    const newerActive = {
      ...ACTIVE,
      contentSha256: "a".repeat(64),
      snapshotStoragePath: `iep/${"a".repeat(64)}.json`,
    };
    const registry = createAsyncDomainPackRegistryPortFromSync(
      createInMemoryDomainPackRegistry([ACTIVE, newerActive]),
    );
    const binding = await resolveProductionDomainPackBindingForStudyStart({
      domainId: "iep",
      registry,
      frozenProposalPackContentSha256: L001_READER_PACK_CONTENT_SHA256,
      readSnapshotBytes: async (entry) => {
        if (entry.contentSha256 !== L001_READER_PACK_CONTENT_SHA256) {
          throw new Error("unexpected snapshot");
        }
        return l001SnapshotRaw();
      },
    });
    expect(binding.selectionMode).toBe("study_pin");
    expect(binding.entry.contentSha256).toBe(L001_READER_PACK_CONTENT_SHA256);
  });

  it("fail-closes when the registry has no active certified pack", async () => {
    const registry = createAsyncDomainPackRegistryPortFromSync(
      createInMemoryDomainPackRegistry([{ ...ACTIVE, isActive: false, activatedAt: null }]),
    );
    await expect(
      resolveProductionDomainPackBindingForStudyStart({
        domainId: "iep",
        registry,
      }),
    ).rejects.toMatchObject({
      code: "DOMAIN_PACK_REGISTRY_NO_ACTIVE_CERTIFIED",
    });
  });

  it("fail-closes when the async registry port is unavailable", async () => {
    const { wrapAsyncDomainPackRegistryPort } = await import("./async-domain-pack-registry-port.js");
    const registry = wrapAsyncDomainPackRegistryPort({
      port: {
        listEntries: vi.fn(async () => {
          throw new Error("connection refused");
        }),
        getByContentSha256: vi.fn(async () => null),
        getActiveCertifiedForDomain: vi.fn(async () => {
          throw new Error("connection refused");
        }),
      },
    });
    await expect(
      resolveProductionDomainPackBindingForStudyStart({
        domainId: "iep",
        registry,
      }),
    ).rejects.toMatchObject({
      code: "DOMAIN_PACK_REGISTRY_UNAVAILABLE",
    });
  });
});
