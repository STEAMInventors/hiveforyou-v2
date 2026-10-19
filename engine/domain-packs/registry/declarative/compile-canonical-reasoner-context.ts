import { createHash } from "node:crypto";

import type { DeclarativePackRaw } from "./types.js";

export const CANONICAL_REASONER_PACK_CONTEXT_SCHEMA_VERSION =
  "hive.canonical-reasoner-pack-context/1" as const;

/** Compiled, domain-neutral JSON fed to the Canonical Reasoner stable prefix. */
export type CompiledCanonicalReasonerContext = {
  schemaVersion: typeof CANONICAL_REASONER_PACK_CONTEXT_SCHEMA_VERSION;
  packId: string;
  packVersion: string;
  contractVersion: string;
  predicateTypes: Array<{
    id: string;
    valueKind: string;
    assertionSemantics?: string;
    allowedUnits?: string[];
    identity?: {
      keys?: string[];
      scope?: string[];
      onAmbiguity?: string;
      occurrenceAnchor?: string;
    };
    temporal?: Record<string, unknown>;
    multiplicity?: string;
  }>;
  relationships: Array<{
    id: string;
    from: string[];
    to: string[];
    primitive: string;
    require?: string[];
    onUncertain?: string;
  }>;
  insightChecks: Array<{
    id: string;
    primitive: string;
    unknownOutcome: string;
    absenceRequiresCoverage?: boolean;
  }>;
  documentTypes: Array<{ id: string; label?: string }>;
  globalReadingNotes: string[];
  /**
   * Declarative v0.2 packs expose predicate types and relationship endpoints, not a dedicated
   * observable-type catalog. Reasoner must infer observable `typeId` from pack relationship `from`/`to`
   * tokens and predicate identity keys until `observableTypes[]` is added to the pack contract.
   */
  observableTypeCatalog: {
    status: "derived_from_relationship_endpoints_and_predicate_identity";
    relationshipEndpointTypeIds: string[];
    note: string;
  };
};

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (v as Record<string, unknown>)[key];
          return acc;
        }, {});
    }
    return v;
  });
}

function collectRelationshipEndpointTypeIds(raw: DeclarativePackRaw): string[] {
  const ids = new Set<string>();
  for (const rel of raw.relationships.relationships) {
    for (const token of [...rel.from, ...rel.to]) {
      const trimmed = token.trim();
      if (trimmed) {
        ids.add(trimmed);
      }
    }
  }
  return [...ids].sort();
}

function normalizeReadingNotes(raw: DeclarativePackRaw): string[] {
  const global = raw.readingNotes.global;
  if (Array.isArray(global)) {
    return global.map((line) => String(line).trim()).filter(Boolean);
  }
  if (typeof global === "string" && global.trim()) {
    return [global.trim()];
  }
  return [];
}

export function compileDeclarativeCanonicalReasonerContext(
  raw: DeclarativePackRaw,
): CompiledCanonicalReasonerContext {
  const endpointTypeIds = collectRelationshipEndpointTypeIds(raw);
  return {
    schemaVersion: CANONICAL_REASONER_PACK_CONTEXT_SCHEMA_VERSION,
    packId: raw.manifest.id,
    packVersion: raw.manifest.packVersion,
    contractVersion: raw.manifest.contractVersion,
    predicateTypes: raw.factTypes.factTypes.map((fact) => ({
      id: fact.id,
      valueKind: fact.valueKind,
      assertionSemantics: fact.assertionSemantics,
      allowedUnits: fact.allowedUnits,
      identity: fact.identity,
      temporal: fact.temporal,
      multiplicity: fact.multiplicity,
    })),
    relationships: raw.relationships.relationships.map((rel) => ({
      id: rel.id,
      from: rel.from,
      to: rel.to,
      primitive: rel.primitive,
      require: rel.require,
      onUncertain: rel.onUncertain,
    })),
    insightChecks: raw.insightChecks.insightChecks.map((check) => ({
      id: check.id,
      primitive: check.primitive,
      unknownOutcome: check.unknownOutcome,
      absenceRequiresCoverage: check.absenceRequiresCoverage,
    })),
    documentTypes: raw.documentTypes.documentTypes.map((doc) => ({
      id: doc.id,
      label: doc.label,
    })),
    globalReadingNotes: normalizeReadingNotes(raw),
    observableTypeCatalog: {
      status: "derived_from_relationship_endpoints_and_predicate_identity",
      relationshipEndpointTypeIds: endpointTypeIds,
      note:
        "No dedicated observableTypes section in domain-pack-declarative/0.2; use relationship endpoints and predicate identity keys when proposing observables.",
    },
  };
}

export function hashCompiledCanonicalReasonerContext(
  context: CompiledCanonicalReasonerContext,
): string {
  return createHash("sha256").update(stableStringify(context), "utf8").digest("hex");
}
