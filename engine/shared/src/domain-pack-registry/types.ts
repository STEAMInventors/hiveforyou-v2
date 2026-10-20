export const DOMAIN_PACK_REGISTRY_LIFECYCLE_STATUSES = [
  "DRAFT",
  "CERTIFIED",
  "RETIRED",
] as const;

export type DomainPackRegistryLifecycleStatus =
  (typeof DOMAIN_PACK_REGISTRY_LIFECYCLE_STATUSES)[number];

export type DomainPackRegistryEntry = {
  domainId: string;
  packId: string;
  packVersion: string;
  contentSha256: string;
  snapshotStorageBucket: string;
  snapshotStoragePath: string;
  lifecycleStatus: DomainPackRegistryLifecycleStatus;
  isActive: boolean;
  activatedAt: string | null;
};

export type DomainPackRegistrySelectionMode =
  | "production_active_certified"
  | "explicit_digest"
  | "study_pin";

export type ResolvedDomainPackRegistryBinding = {
  entry: DomainPackRegistryEntry;
  selectionMode: DomainPackRegistrySelectionMode;
};
