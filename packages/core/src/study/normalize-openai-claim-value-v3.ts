import type { ClaimValue } from "@hiveforyou/shared/case-intelligence/3";

import { MalformedCanonicalStudyProposalError } from "./study-engine-errors";

const CLAIM_VALUE_KINDS = [
  "quantity",
  "text",
  "code",
  "boolean",
  "entity_ref",
  "date",
  "period",
  "unknown",
] as const;

type ClaimValueKind = (typeof CLAIM_VALUE_KINDS)[number];

const TRANSPORT_SLOTS = [
  "numberValue",
  "textValue",
  "codeValue",
  "booleanValue",
  "entityId",
  "dateValue",
  "periodStart",
  "periodEnd",
  "unit",
] as const;

type TransportSlot = (typeof TRANSPORT_SLOTS)[number];

type ClaimValueTransport = {
  kind: ClaimValueKind;
  numberValue: unknown;
  textValue: unknown;
  codeValue: unknown;
  booleanValue: unknown;
  entityId: unknown;
  dateValue: unknown;
  periodStart: unknown;
  periodEnd: unknown;
  unit: unknown;
};

export type NormalizeOpenAIClaimValueOptions = {
  /** Claim-level unit from the transport object. Null means absent. */
  claimUnit?: string | null;
  path?: string;
};

export type NormalizedOpenAIClaimValue = {
  value: ClaimValue;
  unit?: string;
};

function invalid(path: string, reason: string): MalformedCanonicalStudyProposalError {
  return new MalformedCanonicalStudyProposalError(
    `MALFORMED_PROPOSAL:invalid_claim_value:${path}:${reason}`,
  );
}

function isKind(value: string): value is ClaimValueKind {
  return (CLAIM_VALUE_KINDS as readonly string[]).includes(value);
}

function readTransport(value: unknown, path: string): ClaimValueTransport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid(path, "must be an object");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set<string>(["kind", ...TRANSPORT_SLOTS]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw invalid(path, `unexpected property "${key}"`);
    }
  }
  if (typeof record.kind !== "string" || !isKind(record.kind)) {
    throw invalid(path, "kind must be a supported ClaimValue discriminator");
  }
  for (const slot of TRANSPORT_SLOTS) {
    if (!Object.prototype.hasOwnProperty.call(record, slot)) {
      throw invalid(path, `${slot} is required`);
    }
  }
  return {
    kind: record.kind,
    numberValue: record.numberValue,
    textValue: record.textValue,
    codeValue: record.codeValue,
    booleanValue: record.booleanValue,
    entityId: record.entityId,
    dateValue: record.dateValue,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    unit: record.unit,
  };
}

const ACTIVE_TRANSPORT_SLOTS_BY_KIND: Record<ClaimValueKind, readonly TransportSlot[]> = {
  quantity: ["numberValue", "unit"],
  text: ["textValue"],
  code: ["codeValue"],
  boolean: ["booleanValue"],
  entity_ref: ["entityId"],
  date: ["dateValue"],
  period: ["periodStart", "periodEnd"],
  unknown: [],
};

/** OpenAI strict schema requires every slot; models often fill inactive ones — discard before validation. */
function scrubInactiveTransportSlots(transport: ClaimValueTransport): ClaimValueTransport {
  const active = new Set<string>(ACTIVE_TRANSPORT_SLOTS_BY_KIND[transport.kind]);
  const scrubbed = { ...transport };
  for (const slot of TRANSPORT_SLOTS) {
    if (!active.has(slot)) {
      scrubbed[slot] = null;
    }
  }
  return scrubbed;
}

function assertNullSlots(
  transport: ClaimValueTransport,
  allowed: readonly TransportSlot[],
  path: string,
): void {
  const allowedSet = new Set<string>(allowed);
  for (const slot of TRANSPORT_SLOTS) {
    if (allowedSet.has(slot)) {
      continue;
    }
    if (transport[slot] !== null) {
      throw invalid(path, `${slot} must be null when kind is ${transport.kind}`);
    }
  }
}

function requireFiniteNumber(value: unknown, path: string, slot: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalid(path, `${slot} must be a finite number`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, path: string, slot: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalid(path, `${slot} must be a non-empty string`);
  }
  return value;
}

function optionalNonEmptyString(
  value: unknown,
  path: string,
  slot: string,
): string | undefined {
  if (value === null) {
    return undefined;
  }
  return requireNonEmptyString(value, path, slot);
}

function passThroughClaimUnit(claimUnit: string | null | undefined): string | undefined {
  return claimUnit == null ? undefined : claimUnit;
}

function resolveQuantityUnit(
  valueUnit: string | undefined,
  claimUnit: string | null | undefined,
  path: string,
): string | undefined {
  const claimPresent = claimUnit != null;
  if (valueUnit !== undefined && claimPresent && valueUnit !== claimUnit) {
    throw invalid(path, "quantity unit does not match claim unit");
  }
  if (valueUnit !== undefined) {
    return valueUnit;
  }
  return passThroughClaimUnit(claimUnit);
}

/**
 * Converts the OpenAI ClaimValue transport object into the canonical union.
 * Impossible kind/slot combinations throw before canonical validation.
 * The error carries no proposal, so the transport object is not submitted for validation.
 */
export function normalizeOpenAIClaimValue(
  value: unknown,
  options: NormalizeOpenAIClaimValueOptions = {},
): NormalizedOpenAIClaimValue {
  const path = options.path ?? "value";
  const transport = scrubInactiveTransportSlots(readTransport(value, path));
  const claimUnit = options.claimUnit;

  switch (transport.kind) {
    case "quantity": {
      assertNullSlots(transport, ["numberValue", "unit"], path);
      const amount = requireFiniteNumber(transport.numberValue, path, "numberValue");
      const unit = resolveQuantityUnit(
        optionalNonEmptyString(transport.unit, path, "unit"),
        claimUnit,
        path,
      );
      return { value: { kind: "quantity", amount }, unit };
    }
    case "text": {
      assertNullSlots(transport, ["textValue"], path);
      return {
        value: { kind: "text", text: requireNonEmptyString(transport.textValue, path, "textValue") },
        unit: passThroughClaimUnit(claimUnit),
      };
    }
    case "code": {
      assertNullSlots(transport, ["codeValue"], path);
      return {
        value: { kind: "code", code: requireNonEmptyString(transport.codeValue, path, "codeValue") },
        unit: passThroughClaimUnit(claimUnit),
      };
    }
    case "boolean": {
      assertNullSlots(transport, ["booleanValue"], path);
      if (typeof transport.booleanValue !== "boolean") {
        throw invalid(path, "booleanValue must be true or false");
      }
      return {
        value: { kind: "boolean", value: transport.booleanValue },
        unit: passThroughClaimUnit(claimUnit),
      };
    }
    case "entity_ref": {
      assertNullSlots(transport, ["entityId"], path);
      return {
        value: {
          kind: "entity_ref",
          entityId: requireNonEmptyString(transport.entityId, path, "entityId"),
        },
        unit: passThroughClaimUnit(claimUnit),
      };
    }
    case "date": {
      assertNullSlots(transport, ["dateValue"], path);
      return {
        value: { kind: "date", value: requireNonEmptyString(transport.dateValue, path, "dateValue") },
        unit: passThroughClaimUnit(claimUnit),
      };
    }
    case "period": {
      assertNullSlots(transport, ["periodStart", "periodEnd"], path);
      const start = optionalNonEmptyString(transport.periodStart, path, "periodStart");
      const end = optionalNonEmptyString(transport.periodEnd, path, "periodEnd");
      return {
        value: {
          kind: "period",
          ...(start !== undefined ? { start } : {}),
          ...(end !== undefined ? { end } : {}),
        },
        unit: passThroughClaimUnit(claimUnit),
      };
    }
    case "unknown": {
      assertNullSlots(transport, [], path);
      return { value: { kind: "unknown" }, unit: passThroughClaimUnit(claimUnit) };
    }
    default: {
      const _exhaustive: never = transport.kind;
      throw invalid(path, `unsupported kind ${String(_exhaustive)}`);
    }
  }
}
