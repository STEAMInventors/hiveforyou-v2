import { defaultDeclarativePackRepoRoot } from "@hiveforyou/domain-packs/declarative";
import {
  compileMappingPackStageViews,
  declarativeRawForResolvedPack,
  resolveMappingPackForDomain,
  type DomainResolutionState,
  type MappingPackPin,
  type ResolveMappingPackForDomainOptions,
  type ResolvedMappingPack,
} from "@hiveforyou/domain-packs/mapping-pack";

import { discoverViewToPackSnapshot } from "./discover-view-to-snapshot.js";
import type { DiscoverMappingPackContext, MappingPackDiscoverView } from "./types.js";

function enrichDiscoverView(
  rawView: Record<string, unknown>,
  resolved: ResolvedMappingPack,
): MappingPackDiscoverView {
  const profiles = resolved.canonical.documents.documentProfiles;
  const documentProfileConceptMappings = Object.fromEntries(
    profiles.map((profile) => [
      profile.id,
      profile.checklist.map((item) => item.conceptId),
    ]),
  );

  return {
    ...(rawView as Omit<MappingPackDiscoverView, "documentProfileConceptMappings">),
    documentProfileConceptMappings,
  };
}

export function resolveDiscoverMappingPackContext(
  input: Omit<ResolveMappingPackForDomainOptions, "repoRoot"> & {
    repoRoot?: string;
  },
): DiscoverMappingPackContext {
  const repoRoot = input.repoRoot ?? defaultDeclarativePackRepoRoot();
  const resolved = resolveMappingPackForDomain({ ...input, repoRoot });
  const compiled = compileMappingPackStageViews(resolved);
  const discoverView = enrichDiscoverView(
    compiled.views.discover as Record<string, unknown>,
    resolved,
  );

  const packSnapshot = discoverViewToPackSnapshot(discoverView, resolved.canonical.manifest);

  assertPinMatchesView(discoverView.packPin, compiled.pin);
  assertPinMatchesSnapshot(discoverView.packPin, packSnapshot);

  return { pin: compiled.pin, discoverView, packSnapshot };
}

export function resolveDiscoverMappingPackContextForQualificationCase(caseId: string): DiscoverMappingPackContext {
  const normalized = caseId.trim().toLowerCase();
  if (normalized === "l001") {
    return resolveDiscoverMappingPackContext({
      domainId: "iep",
      domainResolution: "known" satisfies DomainResolutionState,
      allowPrerelease: true,
    });
  }
  if (normalized === "bankruptcy") {
    return resolveDiscoverMappingPackContext({
      domainId: "bankruptcy",
      domainResolution: "unknown",
    });
  }
  if (normalized === "unknown") {
    return resolveDiscoverMappingPackContext({
      domainId: "mystery-domain",
      domainResolution: "unknown",
    });
  }
  throw new Error(`Unknown discover qualification case: ${caseId}`);
}

function assertPinMatchesView(pin: MappingPackPin, viewPin: MappingPackPin) {
  if (pin.packId !== viewPin.packId || pin.packVersion !== viewPin.packVersion) {
    throw new Error("Discover view pack identity mismatch vs compiled pin");
  }
  if (pin.contentDigest !== viewPin.contentDigest) {
    throw new Error("Discover view pack digest mismatch vs compiled pin");
  }
}

function assertPinMatchesSnapshot(pin: MappingPackPin, snapshot: DiscoverMappingPackContext["packSnapshot"]) {
  if (snapshot.domainPackVersion !== pin.packVersion) {
    throw new Error("Discover pack snapshot version mismatch vs mapping pack pin");
  }
}

export function mappingPackManifestDigest(resolved: ResolvedMappingPack): string {
  return resolved.pin.contentDigest;
}

export { declarativeRawForResolvedPack, resolveMappingPackForDomain, compileMappingPackStageViews };
