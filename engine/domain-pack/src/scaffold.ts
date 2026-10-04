import type { DocumentDiscoveryGroup } from "@hiveforyou/shared/discovery";

import type {
  CaseMapProjectionPackSnapshot,
  DiscoverDomainPackSnapshot,
  DiscoverRelationshipKind,
  DomainPackManifest,
  NarrativeBlock,
  StoryPackConfig,
} from "./types";

/** JSON-safe copy so pack snapshots cannot be mutated by callers. */
export function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const GENERIC_DOCUMENT_TYPES = ["Document (unclassified)"] as const;
export const GENERIC_FAMILY_ROLES = ["Uploaded file"] as const;

export const STANDARD_RELATIONSHIP_KINDS: readonly DiscoverRelationshipKind[] = [
  "precedes",
  "supports",
  "same_sequence",
  "related",
];

export const GENERIC_DISCOVER_GROUPS: DocumentDiscoveryGroup[] = [
  {
    id: "uploads",
    label: "Uploaded documents",
    description: "Documents recognized in this domain",
    sequenceOrder: 1,
  },
];

export function domainPackRecordId(domainId: string): string {
  return `hive.domain.${domainId}`;
}

/** Empty discover snapshot for a registered pack that has not defined document rules. */
export function genericDiscoverSnapshot(manifest: DomainPackManifest): DiscoverDomainPackSnapshot {
  return {
    domainId: manifest.id,
    domainPackId: domainPackRecordId(manifest.id),
    domainPackVersion: manifest.version,
    domainLabel: manifest.name,
    groups: cloneData(GENERIC_DISCOVER_GROUPS),
    documentTypes: [...GENERIC_DOCUMENT_TYPES],
    familyRoles: [...GENERIC_FAMILY_ROLES],
    relationshipKinds: [...STANDARD_RELATIONSHIP_KINDS],
    catalog: [],
    missingExpectations: [],
  };
}

export function genericCaseMapProjection(manifest: DomainPackManifest): CaseMapProjectionPackSnapshot {
  return {
    domainId: manifest.id,
    domainPackId: domainPackRecordId(manifest.id),
    domainPackVersion: manifest.version,
    rootLabel: "Case",
    fallbackZoneLabel: "Other understanding",
    zones: [],
  };
}

/** Empty narrative for manifest-only scaffold packs. */
export function genericNarrativeBlock(): NarrativeBlock {
  return {
    opening: "Here's where things stand.",
    chapters: [],
    templates: [],
    plain: {},
  };
}

/** Minimal story config for manifest-only scaffold packs. */
export function genericStoryConfig(anchorDocType = "Plan"): StoryPackConfig {
  return {
    anchorDocType,
    supportingWindowDays: 120,
    gapMonths: 13,
    gapExpectedDocTypes: [anchorDocType],
    gapMissingLabel: "expected documents",
    plainLabels: {},
    plainValues: {},
    units: {},
  };
}
