import {
  CASE_INTELLIGENCE_V3_JSON_SCHEMA,
  CANONICAL_STUDY_PROPOSAL_V3_JSON_SCHEMA,
  CANONICAL_STUDY_PROPOSAL_V5_JSON_SCHEMA,
  type JsonSchema,
} from "./json-schema";
import { CANONICAL_STUDY_PROPOSAL_SCHEMA_V5 } from "./types";
import type { CanonicalCaseSnapshot, CanonicalStudyProposal } from "./types";

export type ContractViolation = {
  path: string;
  message: string;
};

export type ContractValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ContractViolation[] };

export function validateCanonicalStudyProposal(
  input: unknown,
): ContractValidationResult<CanonicalStudyProposal> {
  const errors: ContractViolation[] = [];
  const schemaVersion =
    input && typeof input === "object"
      ? (input as { schemaVersion?: string }).schemaVersion
      : undefined;
  const proposalSchema =
    schemaVersion === CANONICAL_STUDY_PROPOSAL_SCHEMA_V5
      ? CANONICAL_STUDY_PROPOSAL_V5_JSON_SCHEMA
      : CANONICAL_STUDY_PROPOSAL_V3_JSON_SCHEMA;
  validateAgainstSchema(input, proposalSchema, "$", errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const proposal = input as CanonicalStudyProposal;
  assertUniqueIds(proposal.entities, "entities", errors);
  assertUniqueIds(proposal.claims, "claims", errors);
  assertUniqueIds(proposal.conflicts, "conflicts", errors);
  assertUniqueIds(proposal.missingInformation, "missingInformation", errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: proposal };
}

export function validateCanonicalCaseSnapshot(
  input: unknown,
): ContractValidationResult<CanonicalCaseSnapshot> {
  const errors: ContractViolation[] = [];
  validateAgainstSchema(input, CASE_INTELLIGENCE_V3_JSON_SCHEMA, "$", errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const snapshot = input as CanonicalCaseSnapshot;
  assertSnapshotInvariants(snapshot, errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: snapshot };
}

function assertSnapshotInvariants(
  snapshot: CanonicalCaseSnapshot,
  errors: ContractViolation[],
): void {
  assertUniqueIds(snapshot.entities, "entities", errors);
  assertUniqueIds(snapshot.claims, "claims", errors);
  assertUniqueIds(snapshot.events, "events", errors);
  assertUniqueIds(snapshot.conflicts, "conflicts", errors);
  assertUniqueIds(snapshot.changes, "changes", errors);
  assertUniqueIds(snapshot.unresolved, "unresolved", errors);

  const claimIds = new Set(snapshot.claims.map((claim) => claim.id));
  const claimById = new Map(snapshot.claims.map((claim) => [claim.id, claim]));

  snapshot.events.forEach((event, index) => {
    if (!claimIds.has(event.claimId)) {
      errors.push({
        path: `events[${index}].claimId`,
        message: "must reference a validated claim id",
      });
      return;
    }
    const hasEventAnchor =
      event.occurredOn !== undefined ||
      event.effectivePeriod !== undefined;
    if (!hasEventAnchor) {
      errors.push({
        path: `events[${index}]`,
        message: "must include occurredOn or effectivePeriod as a time anchor",
      });
    }
    const sourceClaim = claimById.get(event.claimId);
    if (sourceClaim) {
      const claimHasAnchor =
        sourceClaim.occurredOn !== undefined ||
        sourceClaim.effectivePeriod !== undefined;
      if (!claimHasAnchor) {
        errors.push({
          path: `events[${index}].claimId`,
          message: "referenced claim must have a usable time anchor",
        });
      }
    }
  });

  snapshot.conflicts.forEach((conflict, index) => {
    conflict.claimIds.forEach((claimId, idIndex) => {
      if (!claimIds.has(claimId)) {
        errors.push({
          path: `conflicts[${index}].claimIds[${idIndex}]`,
          message: "must reference a validated claim id",
        });
      }
    });
  });

  snapshot.changes.forEach((change, index) => {
    if (!claimIds.has(change.fromClaimId)) {
      errors.push({
        path: `changes[${index}].fromClaimId`,
        message: "must reference a validated claim id",
      });
    }
    if (!claimIds.has(change.toClaimId)) {
      errors.push({
        path: `changes[${index}].toClaimId`,
        message: "must reference a validated claim id",
      });
    }
  });

}

function assertUniqueIds(
  items: readonly { id: string }[],
  path: string,
  errors: ContractViolation[],
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      errors.push({
        path: `${path}[${index}].id`,
        message: `duplicate id "${item.id}"`,
      });
    }
    seen.add(item.id);
  });
}

function validateAgainstSchema(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: ContractViolation[],
): void {
  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    errors.push({ path, message: `must be ${schema.type}` });
    return;
  }

  if (schema.const !== undefined && !Object.is(value, schema.const)) {
    errors.push({ path, message: `must be ${JSON.stringify(schema.const)}` });
    return;
  }

  if (schema.enum !== undefined && !schema.enum.some((entry) => Object.is(entry, value))) {
    errors.push({
      path,
      message: `must be one of: ${schema.enum.map((entry) => JSON.stringify(entry)).join(", ")}`,
    });
    return;
  }

  if (schema.type === "string" && typeof value === "string" && schema.minLength !== undefined) {
    if (value.length < schema.minLength) {
      errors.push({ path, message: `must be at least ${schema.minLength} character(s)` });
    }
  }

  if (
    (schema.type === "number" || schema.type === "integer") &&
    typeof value === "number" &&
    schema.minimum !== undefined &&
    value < schema.minimum
  ) {
    errors.push({ path, message: `must be >= ${schema.minimum}` });
  }

  if (schema.type === "object" || schema.properties || schema.required || schema.additionalProperties === false) {
    validateObject(value, schema, path, errors);
  }

  if (schema.type === "array" && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: `must contain at least ${schema.minItems} item(s)` });
    }
    if (schema.items) {
      const itemSchema = schema.items;
      value.forEach((item, index) => {
        validateAgainstSchema(item, itemSchema, `${path}[${index}]`, errors);
      });
    }
  }

  if (schema.anyOf) {
    applyAnyOf(value, schema.anyOf, path, errors);
  }
  if (schema.oneOf) {
    applyOneOf(value, schema.oneOf, path, errors);
  }
  if (schema.if && schema.then) {
    const ifErrors: ContractViolation[] = [];
    validateAgainstSchema(value, schema.if, path, ifErrors);
    if (ifErrors.length === 0) {
      validateAgainstSchema(value, schema.then, path, errors);
    }
  }
}

function validateObject(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: ContractViolation[],
): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    if (schema.type !== "object") {
      errors.push({ path, message: "must be an object" });
    }
    return;
  }

  const record = value as Record<string, unknown>;
  const properties = schema.properties ?? {};

  if (schema.required) {
    for (const key of schema.required) {
      if (!isPresent(record, key)) {
        errors.push({ path: joinPath(path, key), message: "is required" });
      }
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(record)) {
      if (!isPresent(record, key)) {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        errors.push({
          path: joinPath(path, key),
          message: `unexpected property "${key}"`,
        });
      }
    }
  }

  for (const [key, propertySchema] of Object.entries(properties)) {
    if (isPresent(record, key)) {
      validateAgainstSchema(record[key], propertySchema, joinPath(path, key), errors);
    }
  }
}

function applyAnyOf(
  value: unknown,
  branches: readonly JsonSchema[],
  path: string,
  errors: ContractViolation[],
): void {
  const matched = branches.some((branch) => {
    const branchErrors: ContractViolation[] = [];
    validateAgainstSchema(value, branch, path, branchErrors);
    return branchErrors.length === 0;
  });
  if (matched) {
    return;
  }
  const keys = branches.flatMap((branch) => branch.required ?? []);
  errors.push({
    path,
    message:
      keys.length > 0
        ? `must include at least one of: ${keys.join(", ")}`
        : "must match at least one alternative schema",
  });
}

function applyOneOf(
  value: unknown,
  branches: readonly JsonSchema[],
  path: string,
  errors: ContractViolation[],
): void {
  let matches = 0;
  for (const branch of branches) {
    const branchErrors: ContractViolation[] = [];
    validateAgainstSchema(value, branch, path, branchErrors);
    if (branchErrors.length === 0) {
      matches += 1;
    }
  }
  if (matches === 1) {
    return;
  }
  const kind =
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof value.kind === "string"
      ? value.kind
      : undefined;
  errors.push({
    path,
    message:
      matches === 0
        ? kind
          ? `claim value kind "${kind}" does not match an allowed ClaimValue shape`
          : "does not match any allowed schema"
        : "matches more than one schema",
  });
}

function isPresent(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined;
}

function matchesType(value: unknown, type: NonNullable<JsonSchema["type"]>): boolean {
  switch (type) {
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    default:
      return false;
  }
}

function joinPath(path: string, key: string): string {
  if (path === "$") {
    return key;
  }
  return `${path}.${key}`;
}
