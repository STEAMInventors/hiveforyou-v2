import type {
  DomainPackRegistryEntry,
  ResolvedDomainPackRegistryBinding,
} from "@hiveforyou/shared/domain-pack-registry";

import type { AsyncDomainPackRegistryPort } from "./async-domain-pack-registry-port.js";
import { DomainPackRegistryError } from "./errors.js";
import { loadVerifiedProposalPackSnapshotForRegistryEntry } from "./load-verified-proposal-pack-snapshot.js";
import {
  createInMemoryDomainPackRegistry,
  resolveDomainPackRegistryBinding,
} from "./resolve-domain-pack-registry.js";

export type VerifiedDomainPackRegistryBinding = ResolvedDomainPackRegistryBinding & {
  verifiedContentSha256: string;
};

export async function resolveProductionDomainPackBindingForStudyStart(input: {
  domainId: string;
  registry: AsyncDomainPackRegistryPort;
  frozenProposalPackContentSha256?: string | null;
  env?: Record<string, string | undefined>;
  readSnapshotBytes?: (
    entry: DomainPackRegistryEntry,
  ) => Promise<Uint8Array | string>;
}): Promise<VerifiedDomainPackRegistryBinding> {
  const domainId = input.domainId.trim();
  const frozen = input.frozenProposalPackContentSha256?.trim().toLowerCase() ?? "";

  const mode = frozen ? ("study_pin" as const) : ("production_active_certified" as const);

  const entry =
    mode === "study_pin"
      ? await input.registry.getByContentSha256(frozen)
      : await input.registry.getActiveCertifiedForDomain(domainId);
  if (!entry) {
    throw new DomainPackRegistryError(
      mode === "study_pin"
        ? "DOMAIN_PACK_REGISTRY_DIGEST_UNKNOWN"
        : "DOMAIN_PACK_REGISTRY_NO_ACTIVE_CERTIFIED",
      mode === "study_pin"
        ? `No registry entry matches digest ${frozen}.`
        : `No active CERTIFIED pack is registered for domain ${domainId}.`,
    );
  }

  const binding = resolveDomainPackRegistryBinding({
    domainId,
    registry: createInMemoryDomainPackRegistry([entry]),
    mode,
    contentSha256: frozen || undefined,
  });

  const verified = await loadVerifiedProposalPackSnapshotForRegistryEntry({
    entry: binding.entry,
    env: input.env,
    readSnapshotBytes: input.readSnapshotBytes,
  });

  return {
    ...binding,
    verifiedContentSha256: verified.contentSha256,
  };
}
