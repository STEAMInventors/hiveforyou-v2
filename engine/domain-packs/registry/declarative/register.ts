import type { DeclarativePackRegistration } from "./types.js";

export const DECLARATIVE_PACK_REGISTRATIONS: readonly DeclarativePackRegistration[] = [
  { domainId: "iep", packRootRelative: "engine/domain-packs/iep/v0.2.1", eligible: true },
  { domainId: "synthetic-declarative", packRootRelative: "engine/domain-packs/_fixtures/synthetic-declarative/v0.1.0", eligible: true },
] as const;

export function listDeclarativePackRegistrations(domainId?: string): DeclarativePackRegistration[] {
  const id = domainId?.trim();
  if (!id) return [...DECLARATIVE_PACK_REGISTRATIONS];
  return DECLARATIVE_PACK_REGISTRATIONS.filter((entry) => entry.domainId === id);
}
