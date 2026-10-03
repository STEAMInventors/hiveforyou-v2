import type { DomainPackVocabularySnapshot } from "@hiveforyou/shared/canonical-study";

import {
  cloneData,
  domainPackRecordId,
  genericCaseMapProjection,
  genericDiscoverSnapshot,
} from "./scaffold";
import type { IntakeDomainPackExecutor } from "./intake-execution";
import type {
  CanonicalStudyPackSnapshot,
  CaseMapProjectionPackSnapshot,
  DiscoverDomainPackSnapshot,
  DomainPack,
  DomainPackCapability,
  DomainPackManifest,
  DomainPackVocabularyTerm,
  NarrativeBlock,
  ResolvedDomainPack,
} from "./types";
import { validateNarrativeBlock } from "./validate-narrative-block";

export type DomainPackRegistry = {
  register(pack: DomainPack): void;
  listManifests(): DomainPackManifest[];
  getManifest(id: string): DomainPackManifest | null;
  listByCapability(capability: DomainPackCapability): DomainPackManifest[];
  listDiscoverPacks(): DiscoverDomainPackSnapshot[];
  getDiscoverPackByDomainId(domainId: string): DiscoverDomainPackSnapshot | null;
  getDiscoverPackByDomainLabel(domainLabel: string): DiscoverDomainPackSnapshot | null;
  discoverPackForDomain(domainId: string, domainLabel?: string): DiscoverDomainPackSnapshot;
  getStudyPackByDomainId(domainId: string): CanonicalStudyPackSnapshot | null;
  getRecognitionVocabularyByDomainId(domainId: string): readonly DomainPackVocabularyTerm[];
  getCaseMapProjectionByDomainId(domainId: string): CaseMapProjectionPackSnapshot;
  getNarrativeBlockByDomainId(domainId: string): NarrativeBlock | null;
  getDomainPackByDomainId(domainId: string): DomainPack | null;
  listRoutableManifests(): DomainPackManifest[];
  listExecutableManifests(): DomainPackManifest[];
  getIntakeExecutor(domainId: string): IntakeDomainPackExecutor | null;
  isPackExecutable(domainId: string): boolean;
};

function assertSnapshotIdentity(
  manifest: DomainPackManifest,
  snapshot: { domainId: string; domainPackId: string; domainPackVersion: string },
  kind: string,
): void {
  if (snapshot.domainId !== manifest.id) {
    throw new Error(`${kind} domainId must match manifest id "${manifest.id}".`);
  }
  const recordId = domainPackRecordId(manifest.id);
  if (snapshot.domainPackId !== recordId) {
    throw new Error(`${kind} domainPackId must be "${recordId}".`);
  }
  if (snapshot.domainPackVersion !== manifest.version) {
    throw new Error(`${kind} version must match manifest version "${manifest.version}".`);
  }
}

export function createDomainPackRegistry(): DomainPackRegistry {
  const packs = new Map<string, DomainPack>();

  function discoverSnapshot(pack: DomainPack): DiscoverDomainPackSnapshot {
    return cloneData(pack.discover ?? genericDiscoverSnapshot(pack.manifest));
  }

  return {
    register(pack) {
      const id = pack.manifest.id.trim();
      if (!id || id !== pack.manifest.id) {
        throw new Error("Domain pack id must be a non-empty stable identifier.");
      }
      if (pack.discover) {
        assertSnapshotIdentity(pack.manifest, pack.discover, "Discover snapshot");
      }
      if (pack.study) {
        assertSnapshotIdentity(pack.manifest, pack.study, "Study snapshot");
      }
      if (pack.caseMapProjection) {
        assertSnapshotIdentity(pack.manifest, pack.caseMapProjection, "Case map projection");
      }
      validateNarrativeBlock(pack.narrative, id);
      const existing = packs.get(id);
      if (existing) {
        if (existing.manifest.version !== pack.manifest.version) {
          throw new Error(
            `Domain pack "${id}" is already registered at version ${existing.manifest.version}.`,
          );
        }
        return;
      }
      packs.set(id, pack);
    },

    listManifests() {
      return [...packs.values()].map((pack) => cloneData(pack.manifest));
    },

    getManifest(id) {
      const pack = packs.get(id);
      return pack ? cloneData(pack.manifest) : null;
    },

    listByCapability(capability) {
      return [...packs.values()]
        .filter((pack) => pack.manifest.capabilities.includes(capability))
        .map((pack) => cloneData(pack.manifest));
    },

    listDiscoverPacks() {
      return [...packs.values()].map((pack) => discoverSnapshot(pack));
    },

    getDiscoverPackByDomainId(domainId) {
      const pack = packs.get(domainId);
      return pack ? discoverSnapshot(pack) : null;
    },

    getDiscoverPackByDomainLabel(domainLabel) {
      const normalized = domainLabel.trim().toLowerCase();
      const pack = [...packs.values()].find(
        (candidate) => discoverSnapshot(candidate).domainLabel.trim().toLowerCase() === normalized,
      );
      return pack ? discoverSnapshot(pack) : null;
    },

    discoverPackForDomain(domainId, domainLabel) {
      const registered = packs.get(domainId.trim());
      if (registered) {
        return discoverSnapshot(registered);
      }
      const id = domainId.trim() || "unregistered";
      return genericDiscoverSnapshot({
        id,
        name: domainLabel?.trim() || id,
        description: "",
        version: "none",
        status: "scaffold",
        capabilities: [] as DomainPackCapability[],
        routable: false,
        executable: false,
      });
    },

    getStudyPackByDomainId(domainId) {
      const study = packs.get(domainId)?.study;
      return study ? cloneData(study) : null;
    },

    getRecognitionVocabularyByDomainId(domainId) {
      const terms = packs.get(domainId)?.recognitionVocabulary;
      return terms ? cloneData(terms) : [];
    },

    getCaseMapProjectionByDomainId(domainId) {
      const pack = packs.get(domainId);
      if (!pack) {
        return genericCaseMapProjection({
          id: domainId.trim() || "unknown",
          name: domainId,
          description: "",
          version: "none",
          status: "scaffold",
          capabilities: [],
          routable: false,
          executable: false,
        });
      }
      return cloneData(
        pack.caseMapProjection ?? genericCaseMapProjection(pack.manifest),
      );
    },

    getNarrativeBlockByDomainId(domainId) {
      const block = packs.get(domainId)?.narrative;
      return block ? cloneData(block) : null;
    },

    getDomainPackByDomainId(domainId) {
      const pack = packs.get(domainId);
      return pack ? cloneData(pack) : null;
    },

    listRoutableManifests() {
      return [...packs.values()]
        .filter((pack) => pack.manifest.routable)
        .map((pack) => cloneData(pack.manifest));
    },

    listExecutableManifests() {
      return [...packs.values()]
        .filter((pack) => pack.manifest.executable && pack.intakeExecutor)
        .map((pack) => cloneData(pack.manifest));
    },

    getIntakeExecutor(domainId) {
      const pack = packs.get(domainId);
      if (!pack?.manifest.executable || !pack.intakeExecutor) {
        return null;
      }
      return pack.intakeExecutor;
    },

    isPackExecutable(domainId) {
      const pack = packs.get(domainId);
      return Boolean(pack?.manifest.executable && pack.intakeExecutor);
    },
  };
}

export const domainPackRegistry = createDomainPackRegistry();

export function registerDomainPack(pack: DomainPack): void {
  domainPackRegistry.register(pack);
}

export function listDomainPackManifests(): DomainPackManifest[] {
  return domainPackRegistry.listManifests();
}

export function getDomainPackManifest(id: string): DomainPackManifest | null {
  return domainPackRegistry.getManifest(id);
}

export function listDomainPacksByCapability(
  capability: DomainPackCapability,
): DomainPackManifest[] {
  return domainPackRegistry.listByCapability(capability);
}

export function listDiscoverDomainPacks(): DiscoverDomainPackSnapshot[] {
  return domainPackRegistry.listDiscoverPacks();
}

export function getDiscoverPackByDomainId(domainId: string): DiscoverDomainPackSnapshot | null {
  return domainPackRegistry.getDiscoverPackByDomainId(domainId);
}

export function getDiscoverPackByDomainLabel(
  domainLabel: string,
): DiscoverDomainPackSnapshot | null {
  return domainPackRegistry.getDiscoverPackByDomainLabel(domainLabel);
}

/** Registered pack, or an empty scaffold so a proposed domain is not dropped. */
export function discoverPackForDomain(
  domainId: string,
  domainLabel?: string,
): DiscoverDomainPackSnapshot {
  return domainPackRegistry.discoverPackForDomain(domainId, domainLabel);
}

export function requireDiscoverPack(domainId: string): DiscoverDomainPackSnapshot {
  const pack = getDiscoverPackByDomainId(domainId);
  if (!pack) {
    throw new Error(`No domain pack is registered for "${domainId}".`);
  }
  return pack;
}

export function getStudyPackByDomainId(domainId: string): CanonicalStudyPackSnapshot | null {
  return domainPackRegistry.getStudyPackByDomainId(domainId);
}

export function getRecognitionVocabularyByDomainId(
  domainId: string,
): readonly DomainPackVocabularyTerm[] {
  return domainPackRegistry.getRecognitionVocabularyByDomainId(domainId);
}

export function getCaseMapProjectionByDomainId(
  domainId: string,
): CaseMapProjectionPackSnapshot {
  return domainPackRegistry.getCaseMapProjectionByDomainId(domainId);
}

export function getNarrativeBlockByDomainId(domainId: string): NarrativeBlock | null {
  return domainPackRegistry.getNarrativeBlockByDomainId(domainId);
}

export function getDomainPackByDomainId(domainId: string): DomainPack | null {
  return domainPackRegistry.getDomainPackByDomainId(domainId);
}

export function listRoutableDomainPackManifests(): DomainPackManifest[] {
  return domainPackRegistry.listRoutableManifests();
}

export function listExecutableDomainPackManifests(): DomainPackManifest[] {
  return domainPackRegistry.listExecutableManifests();
}

export function getIntakePackExecutor(domainId: string): IntakeDomainPackExecutor | null {
  return domainPackRegistry.getIntakeExecutor(domainId);
}

export function isDomainPackExecutable(domainId: string): boolean {
  return domainPackRegistry.isPackExecutable(domainId);
}

/** Empty vocabulary — Engine 2 uses model-discovered semantic labels, not pack allowlists. */
export const ENGINE2_NEUTRAL_VOCABULARY: DomainPackVocabularySnapshot = {
  entityTypes: [],
  claimTypes: [],
  relationshipTypes: [],
  eventTypes: [],
};

/**
 * Maps an Engine 1 presentation domainLabel to stable domainId + discover pack version.
 * Used for routing, idempotency, and audit — not Engine 2 semantic validation.
 */
export function resolveDomainPackFromDiscoveryLabel(domainLabel: string): ResolvedDomainPack | null {
  const discover = getDiscoverPackByDomainLabel(domainLabel);
  if (!discover) {
    return null;
  }
  return {
    domainId: discover.domainId,
    domainPackId: discover.domainPackId,
    domainPackVersion: discover.domainPackVersion,
    vocabulary: ENGINE2_NEUTRAL_VOCABULARY,
    audienceRoles: discover.audienceRoles,
  };
}

/** @deprecated Engine 2 does not use domain vocabulary allowlists. */
export function isTypeInDomainVocabulary(
  _vocabulary: DomainPackVocabularySnapshot,
  _kind: "entity" | "claim" | "relationship" | "event" | "derivedClaim",
  _typeName: string,
): boolean {
  return true;
}
