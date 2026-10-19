import type { ObservationRole } from "@hiveforyou/shared/canonical-study-graph";
import { createHash } from "node:crypto";

import type { DeclarativeFactType, DeclarativePackRaw } from "./types.js";

export type PredicateResolution =
  | { ok: true; predicateTypeId: string }
  | { ok: false; code: string; message: string };

export type DeclarativeObservationNormalizerContext = {
  packId: string;
  packVersion: string;
  /** Includes pack fact types plus compiler-registered legacy bridge predicates. */
  predicateTypeIds: ReadonlySet<string>;
  resolvePredicateTypeId(fact: Record<string, unknown>): PredicateResolution;
  resolveObservationRole(fact: Record<string, unknown>, predicateTypeId: string): ObservationRole;
  resolveUnit(fact: Record<string, unknown>, predicateTypeId: string): string | undefined;
};

const MODALITY_TO_ROLE: Record<string, ObservationRole> = {
  planned: "planned",
  required: "planned",
  decided: "actual",
  observed: "observed",
  current: "current",
  historical: "historical",
  superseded: "superseded",
  unknown: "unknown",
};

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function roleFromFactTypeId(factTypeId: string): ObservationRole | null {
  const lower = factTypeId.toLowerCase();
  if (lower.includes("baseline")) {
    return "baseline";
  }
  if (lower.includes("target")) {
    return "target";
  }
  return null;
}

function roleFromTemporal(temporalRole: unknown): ObservationRole {
  switch (temporalRole) {
    case "document":
      return "historical";
    case "observation":
      return "observed";
    case "effective":
      return "current";
    default:
      return "unknown";
  }
}

function inferWireValueKind(fact: Record<string, unknown>): string {
  const value = fact.value;
  if (!value || typeof value !== "object") {
    return "unknown";
  }
  const record = value as Record<string, unknown>;
  const kind = readNonEmptyString(record.kind);
  if (kind) {
    return kind;
  }
  if (typeof record.text === "string" || typeof record.textValue === "string") {
    return "text";
  }
  if (typeof record.amount === "number" || typeof record.numberValue === "number") {
    return "quantity";
  }
  if (typeof record.code === "string" || typeof record.codeValue === "string") {
    return "code";
  }
  if (typeof record.value === "boolean" || typeof record.booleanValue === "boolean") {
    return "boolean";
  }
  if (typeof record.entityId === "string") {
    return "entity_ref";
  }
  if (typeof record.dateValue === "string") {
    return "date";
  }
  return "unknown";
}

function stableConstructDigest(fact: Record<string, unknown>): string {
  const construct = fact.construct;
  const parts: Record<string, string> = {};
  if (construct && typeof construct === "object") {
    const record = construct as Record<string, unknown>;
    for (const key of ["measure", "task", "administration"] as const) {
      const text = readNonEmptyString(record[key]);
      if (text) {
        parts[key] = text;
      }
    }
  }
  const modality = readNonEmptyString(fact.modality) ?? "";
  const payload = {
    construct: parts,
    modality,
    valueKind: inferWireValueKind(fact),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function legacyBridgePredicateTypeId(fact: Record<string, unknown>): string {
  const valueKind = inferWireValueKind(fact);
  const digest = stableConstructDigest(fact);
  return `legacy.reader.${valueKind}.${digest}`;
}

type FactTypeMappingPolicy = {
  modelEmitsObservedPackFactTypeId?: string;
  legacyCanonicalConstructBridge?: string;
  unmappedLegacyFacts?: string;
};

export function compileDeclarativeObservationNormalizer(
  raw: DeclarativePackRaw,
): DeclarativeObservationNormalizerContext {
  const factTypes: DeclarativeFactType[] = raw.factTypes.factTypes ?? [];
  const byId = new Map(factTypes.map((fact) => [fact.id, fact]));
  const predicateTypeIds = new Set(factTypes.map((fact) => fact.id));

  const policy = (raw.factTypes as { factTypeMappingPolicy?: FactTypeMappingPolicy })
    .factTypeMappingPolicy;
  const legacyBridgeMode = policy?.legacyCanonicalConstructBridge ?? "none";
  const unmappedLegacyPolicy = policy?.unmappedLegacyFacts ?? "quarantine";

  return {
    packId: raw.manifest.id,
    packVersion: raw.manifest.packVersion,
    predicateTypeIds,
    resolvePredicateTypeId(fact) {
      const explicit =
        readNonEmptyString(fact.packFactTypeId) ??
        readNonEmptyString(fact.factTypeId) ??
        readNonEmptyString(fact.predicateTypeId);
      if (explicit) {
        if (!byId.has(explicit)) {
          return {
            ok: false,
            code: "UNKNOWN_PACK_FACT_TYPE",
            message: `Unknown pack fact type id ${explicit}`,
          };
        }
        return { ok: true, predicateTypeId: explicit };
      }

      let measure: string | null = null;
      const construct = fact.construct;
      if (construct && typeof construct === "object") {
        measure = readNonEmptyString((construct as Record<string, unknown>).measure);
      }
      if (measure && byId.has(measure)) {
        return { ok: true, predicateTypeId: measure };
      }

      if (legacyBridgeMode === "domain_neutral_mapping_by_typed_construct_parts_and_context") {
        const bridged = legacyBridgePredicateTypeId(fact);
        predicateTypeIds.add(bridged);
        return { ok: true, predicateTypeId: bridged };
      }

      if (unmappedLegacyPolicy === "unresolved_diagnostic_not_silent_drop") {
        return {
          ok: false,
          code: "UNMAPPED_READER_ASSERTION",
          message: measure
            ? `No pack mapping for reader construct measure ${measure}`
            : "Reader fact missing packFactTypeId and construct measure",
        };
      }

      return {
        ok: false,
        code: "UNMAPPED_READER_ASSERTION",
        message: "Reader assertion could not be mapped to a pack predicate type",
      };
    },
    resolveObservationRole(fact, predicateTypeId) {
      const fromId = roleFromFactTypeId(predicateTypeId);
      if (fromId) {
        return fromId;
      }
      const modality = readNonEmptyString(fact.modality)?.toLowerCase();
      if (modality && MODALITY_TO_ROLE[modality]) {
        return MODALITY_TO_ROLE[modality]!;
      }
      const factType = byId.get(predicateTypeId);
      return roleFromTemporal(factType?.temporal?.role);
    },
    resolveUnit(fact, predicateTypeId) {
      const value = fact.value;
      if (value && typeof value === "object") {
        const unit =
          readNonEmptyString((value as Record<string, unknown>).unit) ??
          readNonEmptyString((value as Record<string, unknown>).unitCode);
        if (unit) {
          return unit;
        }
      }
      const factType = byId.get(predicateTypeId);
      const allowed = factType?.allowedUnits ?? [];
      return allowed.length === 1 ? allowed[0] : undefined;
    },
  };
}
