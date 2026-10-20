import type { DomainPackRegistryEntry } from "@hiveforyou/shared/domain-pack-registry";

import type { HiveGateway, HiveRow } from "./hive-gateway";

function rowToEntry(row: HiveRow): DomainPackRegistryEntry {
  return {
    domainId: String(row.domain_id),
    packId: String(row.pack_id),
    packVersion: String(row.pack_version),
    contentSha256: String(row.content_sha256).toLowerCase(),
    snapshotStorageBucket: String(row.snapshot_storage_bucket),
    snapshotStoragePath: String(row.snapshot_storage_path),
    lifecycleStatus: row.lifecycle_status as DomainPackRegistryEntry["lifecycleStatus"],
    isActive: Boolean(row.is_active),
    activatedAt: row.activated_at ? String(row.activated_at) : null,
  };
}

export class SupabaseDomainPackRegistryRepository {
  constructor(private readonly gateway: HiveGateway) {}

  async listEntries(): Promise<DomainPackRegistryEntry[]> {
    const rows = await this.gateway.selectWhere("domain_pack_registry", {}, {});
    return rows.map(rowToEntry);
  }

  async getByContentSha256(contentSha256: string): Promise<DomainPackRegistryEntry | null> {
    const rows = await this.gateway.selectWhere(
      "domain_pack_registry",
      { content_sha256: contentSha256.toLowerCase() },
      { limit: 1 },
    );
    return rows[0] ? rowToEntry(rows[0]) : null;
  }

  async getActiveCertifiedForDomain(domainId: string): Promise<DomainPackRegistryEntry | null> {
    const rows = await this.gateway.selectWhere(
      "domain_pack_registry",
      {
        domain_id: domainId.trim(),
        lifecycle_status: "CERTIFIED",
        is_active: "true",
      },
      { limit: 2 },
    );
    if (rows.length > 1) {
      throw new Error("DOMAIN_PACK_REGISTRY_AMBIGUOUS_ACTIVE");
    }
    return rows[0] ? rowToEntry(rows[0]) : null;
  }
}
