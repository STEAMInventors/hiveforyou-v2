import {
  GENERIC_DOCUMENT_TYPES,
  GENERIC_DISCOVER_GROUPS,
  GENERIC_FAMILY_ROLES,
  STANDARD_RELATIONSHIP_KINDS,
} from "@hiveforyou/domain-pack";

import { compileDeclarativeCanonicalReasonerContext } from "../declarative/compile-canonical-reasoner-context.js";
import { compileDeclarativeObservationNormalizer } from "../declarative/compile-observation-normalizer.js";
import { compileDeclarativePackToProposal } from "../declarative/compile-to-proposal.js";
import { declarativeRawForResolvedPack } from "./resolve.js";
import type {
  CompiledMappingPackStageViews,
  MappingPackPin,
  MappingPackStage,
  ResolvedMappingPack,
} from "./types.js";

const STAGE_SCHEMA_VERSIONS: Record<MappingPackStage, string> = {
  discover: "hive.mapping-pack-discover-view/1",
  reader: "hive.mapping-pack-reader-view/1",
  normalizer: "hive.mapping-pack-normalizer-view/1",
  reasoner: "hive.mapping-pack-reasoner-view/1",
  validator: "hive.mapping-pack-validator-view/1",
  writer: "hive.mapping-pack-writer-view/1",
  application: "hive.mapping-pack-application-view/1",
};

function withPin<T extends Record<string, unknown>>(pin: MappingPackPin, stage: MappingPackStage, body: T) {
  return {
    schemaVersion: STAGE_SCHEMA_VERSIONS[stage],
    packPin: pin,
    ...body,
  };
}

export function compileMappingPackStageViews(resolved: ResolvedMappingPack): CompiledMappingPackStageViews {
  const { pin, canonical } = resolved;
  const raw = declarativeRawForResolvedPack(resolved);

  const missingRequired: string[] = [];
  if (canonical.concepts.concepts.length === 0) missingRequired.push("concepts");
  if (canonical.documents.documentProfiles.length === 0) missingRequired.push("documents.documentProfiles");
  if (canonical.personas.personas.length === 0) missingRequired.push("personas");

  const readerCompiled = compileDeclarativePackToProposal(raw);
  const normalizerCompiled = compileDeclarativeObservationNormalizer(raw);
  const reasonerCompiled = compileDeclarativeCanonicalReasonerContext(raw);

  const documentTypeLabels = canonical.documents.documentProfiles.map(
    (doc) => doc.label ?? doc.id,
  );
  const discoverDocumentTypes =
    documentTypeLabels.length > 0 ? documentTypeLabels : [...GENERIC_DOCUMENT_TYPES];

  const views = {
    discover: withPin(pin, "discover", {
      domainId: pin.domainId ?? canonical.manifest.id,
      documentTypes: discoverDocumentTypes,
      groups: GENERIC_DISCOVER_GROUPS,
      familyRoles: [...GENERIC_FAMILY_ROLES],
      relationshipKinds: [...STANDARD_RELATIONSHIP_KINDS],
      recognitionHints: Object.fromEntries(
        canonical.documents.documentProfiles
          .filter((doc) => (doc.recognitionHints?.length ?? 0) > 0)
          .map((doc) => [doc.id, doc.recognitionHints ?? []]),
      ),
      missingRequiredDefinitions: missingRequired,
    }),
    reader: withPin(pin, "reader", {
      proposalManifest: readerCompiled.manifest,
      recordTypeCount: readerCompiled.recordTypes.length,
      documentTypeCount: readerCompiled.documentTypes.length,
      compiledProposalPack: readerCompiled,
    }),
    normalizer: withPin(pin, "normalizer", {
      packId: normalizerCompiled.packId,
      packVersion: normalizerCompiled.packVersion,
      predicateTypeCount: normalizerCompiled.predicateTypeIds.size,
      conceptMappingPolicy: canonical.concepts.conceptMappingPolicy ?? null,
      context: normalizerCompiled,
    }),
    reasoner: withPin(pin, "reasoner", {
      compiledContext: reasonerCompiled,
      relationshipCount: reasonerCompiled.relationships.length,
      predicateTypeCount: reasonerCompiled.predicateTypes.length,
    }),
    validator: withPin(pin, "validator", {
      relationshipRules: canonical.relationships.relationships,
      insightChecks: canonical.relationships.insightChecks ?? [],
      requirements: canonical.relationships.requirements ?? [],
      conceptValueKinds: Object.fromEntries(
        canonical.concepts.concepts.map((concept) => [concept.id, concept.valueKind]),
      ),
      missingRequiredDefinitions: missingRequired,
    }),
    writer: withPin(pin, "writer", {
      personas: canonical.personas.personas,
      plainExplainers: canonical.personas.plainExplainers ?? null,
    }),
    application: withPin(pin, "application", {
      personas: canonical.personas.personas.map((persona) => ({
        id: persona.id,
        entitlementId: persona.entitlementId,
        label: persona.label,
      })),
      documentProfiles: canonical.documents.documentProfiles.map((doc) => ({
        id: doc.id,
        label: doc.label ?? doc.id,
      })),
    }),
  } satisfies CompiledMappingPackStageViews["views"];

  for (const stage of Object.keys(views) as MappingPackStage[]) {
    const view = views[stage];
    if (view.packPin.contentDigest !== pin.contentDigest) {
      throw new Error(`Stage view ${stage} pack digest mismatch`);
    }
    if (view.packPin.packId !== pin.packId || view.packPin.packVersion !== pin.packVersion) {
      throw new Error(`Stage view ${stage} pack identity mismatch`);
    }
  }

  return { pin, views };
}
