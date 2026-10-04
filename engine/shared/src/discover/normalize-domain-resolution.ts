import type { DiscoverDomainResolutionStatus } from "./proposal";

/** Maps model-facing SINGLE_DOMAIN to legacy RESOLVED where downstream expects it. */
export function normalizeDomainResolutionStatus(
  status: DiscoverDomainResolutionStatus,
): DiscoverDomainResolutionStatus {
  return status === "SINGLE_DOMAIN" ? "RESOLVED" : status;
}

export function isResolvedDomainStatus(status: DiscoverDomainResolutionStatus): boolean {
  return status === "RESOLVED" || status === "SINGLE_DOMAIN";
}
