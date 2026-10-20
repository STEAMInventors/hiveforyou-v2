import type { DomainPackRegistryEntry } from "@hiveforyou/shared/domain-pack-registry";

import { DomainPackRegistryError } from "./errors.js";
import type { DomainPackRegistryPort } from "./resolve-domain-pack-registry.js";

export type AsyncDomainPackRegistryPort = {
  listEntries(): Promise<DomainPackRegistryEntry[]>;
  getByContentSha256(contentSha256: string): Promise<DomainPackRegistryEntry | null>;
  getActiveCertifiedForDomain(domainId: string): Promise<DomainPackRegistryEntry | null>;
};

export function createAsyncDomainPackRegistryPortFromSync(
  registry: DomainPackRegistryPort,
): AsyncDomainPackRegistryPort {
  return {
    listEntries: async () => registry.listEntries(),
    getByContentSha256: async (hash) => registry.getByContentSha256(hash),
    getActiveCertifiedForDomain: async (domainId) =>
      registry.getActiveCertifiedForDomain(domainId),
  };
}

export function wrapAsyncDomainPackRegistryPort(input: {
  port: AsyncDomainPackRegistryPort;
  onUnavailable?: (error: unknown) => never;
}): AsyncDomainPackRegistryPort {
  const fail =
    input.onUnavailable ??
    ((error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Domain pack registry is unavailable.";
      throw new DomainPackRegistryError("DOMAIN_PACK_REGISTRY_UNAVAILABLE", message);
    });

  async function guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DomainPackRegistryError) {
        throw error;
      }
      return fail(error);
    }
  }

  return {
    listEntries: () => guard(() => input.port.listEntries()),
    getByContentSha256: (hash) => guard(() => input.port.getByContentSha256(hash)),
    getActiveCertifiedForDomain: (domainId) =>
      guard(() => input.port.getActiveCertifiedForDomain(domainId)),
  };
}
