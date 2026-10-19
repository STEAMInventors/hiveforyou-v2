import { defaultDeclarativePackRepoRoot } from "@hiveforyou/domain-packs/declarative";
import {
  compileMappingPackStageViews,
  resolveMappingPackForDomain,
  type DomainResolutionState,
  type MappingPackPin,
  type ResolveMappingPackForDomainOptions,
  type ResolvedMappingPack,
} from "@hiveforyou/domain-packs/mapping-pack";

import type { MappingPackReaderView, ReaderMappingPackContext } from "./types.js";

function enrichReaderView(
  rawView: Record<string, unknown>,
  resolved: ResolvedMappingPack,
): MappingPackReaderView {
  const profiles = resolved.canonical.documents.documentProfiles;
  const documentProfileConceptMappings = Object.fromEntries(
    profiles.map((profile) => [
      profile.id,
      profile.checklist.map((item) => item.conceptId),
    ]),
  );

  const compiled = rawView.compiledProposalPack as MappingPackReaderView["compiledProposalPack"];
  if (!compiled?.manifest) {
    throw new Error("Reader view missing compiledProposalPack");
  }

  return {
    schemaVersion: String(rawView.schemaVersion),
    packPin: rawView.packPin as MappingPackPin,
    proposalManifest: compiled.manifest,
    recordTypeCount: Number(rawView.recordTypeCount ?? 0),
    documentTypeCount: Number(rawView.documentTypeCount ?? 0),
    compiledProposalPack: compiled,
    documentProfileConceptMappings,
  };
}

export function resolveReaderMappingPackContext(
  input: Omit<ResolveMappingPackForDomainOptions, "repoRoot"> & {
    repoRoot?: string;
  },
): ReaderMappingPackContext {
  const repoRoot = input.repoRoot ?? defaultDeclarativePackRepoRoot();
  const resolved = resolveMappingPackForDomain({ ...input, repoRoot });
  const compiled = compileMappingPackStageViews(resolved);
  const readerView = enrichReaderView(compiled.views.reader as Record<string, unknown>, resolved);

  assertPinMatchesView(readerView.packPin, compiled.pin);

  return {
    pin: compiled.pin,
    readerView,
    proposalPack: readerView.compiledProposalPack,
  };
}

export function resolveReaderMappingPackContextForQualificationCase(
  caseId: string,
): ReaderMappingPackContext {
  const normalized = caseId.trim().toLowerCase();
  if (normalized === "l001") {
    return resolveReaderMappingPackContext({
      domainId: "iep",
      domainResolution: "known" satisfies DomainResolutionState,
      allowPrerelease: true,
    });
  }
  if (normalized === "bankruptcy") {
    return resolveReaderMappingPackContext({
      domainId: "bankruptcy",
      domainResolution: "unknown",
    });
  }
  if (normalized === "unknown") {
    return resolveReaderMappingPackContext({
      domainId: "mystery-domain",
      domainResolution: "unknown",
    });
  }
  throw new Error(`Unknown reader qualification case: ${caseId}`);
}

function assertPinMatchesView(pin: MappingPackPin, viewPin: MappingPackPin) {
  if (pin.packId !== viewPin.packId || pin.packVersion !== viewPin.packVersion) {
    throw new Error("Reader view pack identity mismatch vs compiled pin");
  }
  if (pin.contentDigest !== viewPin.contentDigest) {
    throw new Error("Reader view pack digest mismatch vs compiled pin");
  }
}

export { compileMappingPackStageViews, resolveMappingPackForDomain };
