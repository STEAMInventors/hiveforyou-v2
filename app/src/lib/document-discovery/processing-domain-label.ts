import type { HiveDiscoverResult } from "@hiveforyou/shared/discover";

export type ProcessingDomainHint =
  | { kind: "neutral" }
  | { kind: "resolved"; label: string };

/** Customer-facing domain line during processing — avoid implying a domain before routing is known. */
export function resolveProcessingDomainHint(input: {
  discoverResult: HiveDiscoverResult | null;
}): ProcessingDomainHint {
  const doc = input.discoverResult?.documentDiscovery;
  if (!doc) {
    return { kind: "neutral" };
  }
  if (doc.domainSections && doc.domainSections.length > 1) {
    return { kind: "neutral" };
  }
  if (doc.domainResolutionStatus === "resolved") {
    return { kind: "resolved", label: doc.domainLabel };
  }
  return { kind: "neutral" };
}
