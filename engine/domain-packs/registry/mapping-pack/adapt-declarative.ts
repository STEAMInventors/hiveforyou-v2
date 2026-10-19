import type { DeclarativePackRaw } from "../declarative/types.js";
import type {
  MappingPackCanonical,
  MappingPackConcept,
  MappingPackConceptSection,
  MappingPackDocumentProfile,
  MappingPackDocumentsSection,
  MappingPackManifest,
  MappingPackPersonasSection,
  MappingPackRelationshipsSection,
} from "./types.js";
import { MAPPING_PACK_CONTRACT_VERSION } from "./types.js";

function readingNotesGlobal(raw: DeclarativePackRaw): string[] {
  const global = raw.readingNotes.global;
  if (Array.isArray(global)) {
    return global;
  }
  if (typeof global === "string" && global.trim()) {
    return [global];
  }
  return [];
}

export function adaptDeclarativeToMappingPack(raw: DeclarativePackRaw): MappingPackCanonical {
  const manifest: MappingPackManifest = {
    id: raw.manifest.id,
    name: raw.manifest.name,
    packVersion: raw.manifest.packVersion,
    contractVersion: MAPPING_PACK_CONTRACT_VERSION,
    status: raw.manifest.status,
    schemaSections: ["concepts", "documents", "relationships", "personas"],
  };

  const factPolicy = (raw.factTypes as { factTypeMappingPolicy?: MappingPackConceptSection["conceptMappingPolicy"] })
    .factTypeMappingPolicy;

  const concepts: MappingPackConceptSection = {
    version: raw.manifest.packVersion,
    concepts: (raw.factTypes.factTypes ?? []).map(
      (fact): MappingPackConcept => ({
        id: fact.id,
        valueKind: fact.valueKind,
        allowedUnits: fact.allowedUnits,
        assertionSemantics: fact.assertionSemantics,
        evidencePolicy: fact.evidencePolicy,
        identity: fact.identity,
        temporal: fact.temporal,
        multiplicity: fact.multiplicity,
      }),
    ),
    referenceTables: raw.referenceTables,
    vocabulary: raw.vocabulary,
    conceptMappingPolicy: factPolicy,
  };

  const documentProfiles: MappingPackDocumentProfile[] = (raw.documentTypes.documentTypes ?? []).map((doc) => ({
    id: doc.id,
    label: doc.label,
    family: doc.family,
    subtypes: doc.subtypes,
    recognitionHints: doc.recognitionHints,
    checklist: doc.checklist.map((item) => ({
      conceptId: item.factTypeId,
      mode: item.mode,
      repeatable: item.repeatable,
    })),
    allowAdditionalSourceFacts: doc.allowAdditionalPackFacts,
  }));

  const documents: MappingPackDocumentsSection = {
    version: raw.manifest.packVersion,
    documentProfiles,
    globalReadingNotes: readingNotesGlobal(raw),
    documentReadingNotes: raw.readingNotes.documentSpecific,
  };

  const relationships: MappingPackRelationshipsSection = {
    version: raw.manifest.packVersion,
    relationships: (raw.relationships.relationships ?? []).map((rel) => ({
      id: rel.id,
      from: rel.from,
      to: rel.to,
      primitive: rel.primitive,
      require: rel.require,
      onUncertain: rel.onUncertain,
    })),
    insightChecks: raw.insightChecks.insightChecks ?? [],
    requirements: raw.requirements.requirements ?? [],
  };

  const audiencePersonas = (raw.audience as { personas?: MappingPackPersonasSection["personas"] })?.personas ?? [];
  const personas: MappingPackPersonasSection = {
    version: raw.manifest.packVersion,
    personas: audiencePersonas.map((persona) => ({
      id: persona.id,
      label: persona.label,
      readingLevel: persona.readingLevel,
      requiredViews: persona.requiredViews,
      priorities: persona.priorities,
      contentRequirements: persona.requiredViews,
      objectives: persona.priorities,
    })),
    plainExplainers: raw.plainExplainers,
  };

  return { manifest, concepts, documents, relationships, personas };
}
