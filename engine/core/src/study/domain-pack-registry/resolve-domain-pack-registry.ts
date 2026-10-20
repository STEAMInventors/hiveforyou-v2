import type {
  DomainPackRegistryEntry,
  ResolvedDomainPackRegistryBinding,
} from "@hiveforyou/shared/domain-pack-registry";

import type { ProposalPackIdentity } from "../resolve-proposal-pack-identity.js";
import { DomainPackRegistryError } from "./errors.js";

const SHA256_HEX = /^[a-f0-9]{64}$/;

export type DomainPackRegistryPort = {
  listEntries(): DomainPackRegistryEntry[];
  getByContentSha256(contentSha256: string): DomainPackRegistryEntry | null;
  getActiveCertifiedForDomain(domainId: string): DomainPackRegistryEntry | null;
};

export function createInMemoryDomainPackRegistry(entries: DomainPackRegistryEntry[]): DomainPackRegistryPort {
  const normalized = entries.map(normalizeRegistryEntry);
  return {
    listEntries: () => normalized,
    getByContentSha256: (hash) =>
      normalized.find((entry) => entry.contentSha256 === hash.toLowerCase()) ?? null,
    getActiveCertifiedForDomain: (domainId) => {
      const matches = normalized.filter(
        (entry) =>
          entry.domainId === domainId.trim() &&
          entry.lifecycleStatus === "CERTIFIED" &&
          entry.isActive,
      );
      if (matches.length > 1) {
        throw new DomainPackRegistryError(
          "DOMAIN_PACK_REGISTRY_AMBIGUOUS_ACTIVE",
          `Multiple active certified packs for domain ${domainId}.`,
        );
      }
      return matches[0] ?? null;
    },
  };
}

function normalizeRegistryEntry(entry: DomainPackRegistryEntry): DomainPackRegistryEntry {
  return {
    ...entry,
    domainId: entry.domainId.trim(),
    packId: entry.packId.trim(),
    packVersion: entry.packVersion.trim(),
    contentSha256: entry.contentSha256.trim().toLowerCase(),
    snapshotStorageBucket: entry.snapshotStorageBucket.trim(),
    snapshotStoragePath: entry.snapshotStoragePath.trim(),
  };
}

export function resolveDomainPackRegistryBinding(input: {
  domainId: string;
  registry: DomainPackRegistryPort;
  mode: "production_active_certified" | "explicit_digest" | "study_pin";
  contentSha256?: string | null;
}): ResolvedDomainPackRegistryBinding {
  const domainId = input.domainId.trim();
  if (!domainId) {
    throw new DomainPackRegistryError("DOMAIN_PACK_REGISTRY_DOMAIN_REQUIRED", "domainId is required.");
  }

  if (input.mode === "study_pin" || input.mode === "explicit_digest") {
    const hash = input.contentSha256?.trim().toLowerCase() ?? "";
    if (!SHA256_HEX.test(hash)) {
      throw new DomainPackRegistryError(
        "DOMAIN_PACK_REGISTRY_DIGEST_REQUIRED",
        "An explicit content_sha256 pin is required for this selection mode.",
      );
    }
    const entry = input.registry.getByContentSha256(hash);
    if (!entry) {
      throw new DomainPackRegistryError(
        "DOMAIN_PACK_REGISTRY_DIGEST_UNKNOWN",
        `No registry entry matches digest ${hash}.`,
      );
    }
    if (entry.domainId !== domainId) {
      throw new DomainPackRegistryError(
        "DOMAIN_PACK_REGISTRY_DOMAIN_MISMATCH",
        `Registry entry domain ${entry.domainId} does not match ${domainId}.`,
      );
    }
    if (input.mode === "explicit_digest" && entry.lifecycleStatus === "RETIRED") {
      throw new DomainPackRegistryError(
        "DOMAIN_PACK_REGISTRY_RETIRED",
        `Registry entry ${hash} is RETIRED.`,
      );
    }
    return {
      entry,
      selectionMode: input.mode,
    };
  }

  const active = input.registry.getActiveCertifiedForDomain(domainId);
  if (!active) {
    throw new DomainPackRegistryError(
      "DOMAIN_PACK_REGISTRY_NO_ACTIVE_CERTIFIED",
      `No active CERTIFIED pack is registered for domain ${domainId}.`,
    );
  }
  return { entry: active, selectionMode: "production_active_certified" };
}

export function registryBindingToProposalPackIdentity(
  binding: ResolvedDomainPackRegistryBinding,
): ProposalPackIdentity {
  const entry = binding.entry;
  return {
    packId: entry.packId,
    packVersion: entry.packVersion,
    packContentSha256: entry.contentSha256,
  };
}

/** Documented activation SQL (not executed here): `select hive.activate_domain_pack_registry_entry('<digest>');` */
export const DOMAIN_PACK_REGISTRY_ACTIVATION_PROCEDURE = [
  "1. Certify the target registry row (lifecycle_status = CERTIFIED) via controlled ops — not automatic.",
  "2. As service_role: select hive.activate_domain_pack_registry_entry('<content_sha256>');",
  "3. Deactivate prior active row for the domain; set activated_at on the new active row.",
  "4. Roll back by activating a previous CERTIFIED digest or setting is_active = false on all rows (production studies fail closed until a pack is active).",
] as const;
