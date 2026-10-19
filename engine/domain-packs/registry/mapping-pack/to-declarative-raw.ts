import type { DeclarativeInsightCheck, DeclarativePackRaw } from "../declarative/types.js";
import { DECLARATIVE_PACK_CONTRACT_VERSION } from "../declarative/types.js";
import type { MappingPackCanonical } from "./types.js";

/** Reconstruct declarative-shaped raw data so existing stage compilers remain authoritative views. */
export function mappingPackToDeclarativeRaw(canonical: MappingPackCanonical): DeclarativePackRaw {
  const { manifest } = canonical;
  return {
    manifest: {
      id: manifest.id,
      name: manifest.name,
      packVersion: manifest.packVersion,
      contractVersion: DECLARATIVE_PACK_CONTRACT_VERSION,
      status: manifest.status,
      schemaSections: [
        "audience",
        "document-types",
        "fact-types",
        "requirements",
        "insight-checks",
        "plain-explainers",
        "reading-notes",
        "vocabulary",
        "reference-tables",
      ],
      additionalDefinitions: ["relationships"],
    },
    audience: {
      version: canonical.personas.version,
      personas: canonical.personas.personas.map((persona) => ({
        id: persona.id,
        label: persona.label,
        readingLevel: persona.readingLevel,
        requiredViews: persona.contentRequirements ?? persona.requiredViews,
        priorities: persona.objectives ?? persona.priorities,
      })),
    },
    documentTypes: {
      documentTypes: canonical.documents.documentProfiles.map((doc) => ({
        id: doc.id,
        label: doc.label,
        family: doc.family,
        subtypes: doc.subtypes,
        recognitionHints: doc.recognitionHints,
        checklist: doc.checklist.map((item) => ({
          factTypeId: item.conceptId,
          mode: item.mode,
          repeatable: item.repeatable,
        })),
        allowAdditionalPackFacts: doc.allowAdditionalSourceFacts,
      })),
    },
    factTypes: {
      factTypes: canonical.concepts.concepts.map((concept) => ({
        id: concept.id,
        valueKind: concept.valueKind,
        allowedUnits: concept.allowedUnits,
        assertionSemantics: concept.assertionSemantics,
        evidencePolicy: concept.evidencePolicy,
        identity: concept.identity,
        temporal: concept.temporal,
        multiplicity: concept.multiplicity,
      })),
      ...(canonical.concepts.conceptMappingPolicy
        ? { factTypeMappingPolicy: canonical.concepts.conceptMappingPolicy }
        : {}),
    },
    relationships: {
      relationships: canonical.relationships.relationships.map((rel) => ({
        id: rel.id,
        from: rel.from,
        to: rel.to,
        primitive: rel.primitive,
        require: rel.require,
        onUncertain: rel.onUncertain,
      })),
    },
    requirements: { requirements: canonical.relationships.requirements ?? [] },
    insightChecks: {
      insightChecks: (canonical.relationships.insightChecks ?? []) as DeclarativeInsightCheck[],
    },
    readingNotes: {
      global: canonical.documents.globalReadingNotes ?? [],
      documentSpecific: canonical.documents.documentReadingNotes,
    },
    vocabulary: canonical.concepts.vocabulary ?? {},
    plainExplainers: canonical.personas.plainExplainers ?? {},
    referenceTables: canonical.concepts.referenceTables ?? {},
  };
}
