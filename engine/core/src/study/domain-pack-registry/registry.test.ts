import { describe, expect, it } from "vitest";

import type { DomainPackRegistryEntry } from "@hiveforyou/shared/domain-pack-registry";

import {
  IEP_CANDIDATE_READER_PACK_CONTENT_SHA256,
  L001_READER_PACK_CONTENT_SHA256,
} from "../resolve-canonical-study-interpretation.js";
import { DomainPackRegistryError } from "./errors.js";
import { loadVerifiedProposalPackSnapshotForRegistryEntrySync } from "./load-verified-proposal-pack-snapshot.js";
import {
  createInMemoryDomainPackRegistry,
  resolveDomainPackRegistryBinding,
} from "./resolve-domain-pack-registry.js";

const HISTORICAL: DomainPackRegistryEntry = {
  domainId: "iep",
  packId: "iep",
  packVersion: "0.3.0-proposed",
  contentSha256: L001_READER_PACK_CONTENT_SHA256,
  snapshotStorageBucket: "domain-pack-snapshots",
  snapshotStoragePath: `iep/${L001_READER_PACK_CONTENT_SHA256}.json`,
  lifecycleStatus: "CERTIFIED",
  isActive: false,
  activatedAt: null,
};

const CANDIDATE: DomainPackRegistryEntry = {
  domainId: "iep",
  packId: "iep",
  packVersion: "0.3.0-proposed",
  contentSha256: IEP_CANDIDATE_READER_PACK_CONTENT_SHA256,
  snapshotStorageBucket: "domain-pack-snapshots",
  snapshotStoragePath: `iep/${IEP_CANDIDATE_READER_PACK_CONTENT_SHA256}.json`,
  lifecycleStatus: "DRAFT",
  isActive: false,
  activatedAt: null,
};

describe("domain pack registry resolution", () => {
  it("selects active certified pack for production", () => {
    const active = { ...HISTORICAL, isActive: true, activatedAt: "2026-01-01T00:00:00.000Z" };
    const binding = resolveDomainPackRegistryBinding({
      domainId: "iep",
      registry: createInMemoryDomainPackRegistry([HISTORICAL, CANDIDATE, active]),
      mode: "production_active_certified",
    });
    expect(binding.entry.contentSha256).toBe(L001_READER_PACK_CONTENT_SHA256);
  });

  it("allows explicit draft digest selection", () => {
    const binding = resolveDomainPackRegistryBinding({
      domainId: "iep",
      registry: createInMemoryDomainPackRegistry([HISTORICAL, CANDIDATE]),
      mode: "explicit_digest",
      contentSha256: IEP_CANDIDATE_READER_PACK_CONTENT_SHA256,
    });
    expect(binding.entry.lifecycleStatus).toBe("DRAFT");
  });

  it("fail-closes when no active certified pack exists", () => {
    expect(() =>
      resolveDomainPackRegistryBinding({
        domainId: "iep",
        registry: createInMemoryDomainPackRegistry([HISTORICAL, CANDIDATE]),
        mode: "production_active_certified",
      }),
    ).toThrow(DomainPackRegistryError);
  });

  it("verifies loaded snapshot content against registry digest", () => {
    const loaded = loadVerifiedProposalPackSnapshotForRegistryEntrySync({ entry: CANDIDATE });
    expect(loaded.contentSha256).toBe(IEP_CANDIDATE_READER_PACK_CONTENT_SHA256);
  });
});
