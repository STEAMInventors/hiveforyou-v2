import type { MappingPackRegistration } from "./types.js";

export const MAPPING_PACK_REGISTRATIONS: readonly MappingPackRegistration[] = [
  {
    domainId: "generic",
    source: "native",
    packRootRelative: "engine/domain-packs/generic/v1.0.0",
    eligible: true,
    isGenericFallback: true,
  },
  {
    domainId: "iep",
    source: "declarative",
    packRootRelative: "engine/domain-packs/iep/v0.2.1",
    eligible: true,
    allowPrerelease: true,
  },
  {
    domainId: "synthetic-declarative",
    source: "declarative",
    packRootRelative: "engine/domain-packs/_fixtures/synthetic-declarative/v0.1.0",
    eligible: true,
  },
  {
    domainId: "fixture-malformed",
    source: "native",
    packRootRelative: "engine/domain-packs/_fixtures/malformed-mapping/v0.0.1",
    eligible: true,
  },
] as const;

export function listMappingPackRegistrations(domainId?: string): MappingPackRegistration[] {
  const id = domainId?.trim();
  if (!id) return [...MAPPING_PACK_REGISTRATIONS];
  return MAPPING_PACK_REGISTRATIONS.filter((entry) => entry.domainId === id);
}

export function genericFallbackRegistration(): MappingPackRegistration {
  const generic = MAPPING_PACK_REGISTRATIONS.find((entry) => entry.isGenericFallback);
  if (!generic) {
    throw new Error("Generic fallback mapping pack registration missing");
  }
  return generic;
}
