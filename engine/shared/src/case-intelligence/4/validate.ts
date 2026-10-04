import { CLAIM_MODALITIES, CONFLICT_KINDS, MISSING_GAP_KINDS } from "./types";
import type { CanonicalStudyProposalV4 } from "./types";

export type ContractViolation = {
  path: string;
  message: string;
};

export type ContractValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ContractViolation[] };

export function validateCanonicalStudyProposalV4(
  input: unknown,
): ContractValidationResult<CanonicalStudyProposalV4> {
  const errors: ContractViolation[] = [];
  if (!input || typeof input !== "object") {
    return { ok: false, errors: [{ path: "$", message: "Expected object." }] };
  }
  const root = input as Record<string, unknown>;
  if (root.schemaVersion !== "canonical-study-proposal/4") {
    errors.push({ path: "$.schemaVersion", message: "Must be canonical-study-proposal/4." });
  }
  if (typeof root.domainId !== "string" || !root.domainId.trim()) {
    errors.push({ path: "$.domainId", message: "Required non-empty string." });
  }
  for (const key of ["entities", "claims", "conflicts", "missingInformation"] as const) {
    if (!Array.isArray(root[key])) {
      errors.push({ path: `$.${key}`, message: "Required array." });
    }
  }
  if (errors.length) {
    return { ok: false, errors };
  }

  const entities = root.entities as unknown[];
  const claims = root.claims as unknown[];
  const conflicts = root.conflicts as unknown[];
  const missingInformation = root.missingInformation as unknown[];

  assertUniqueIds(entities, "entities", errors);
  assertUniqueIds(claims, "claims", errors);
  assertUniqueIds(conflicts, "conflicts", errors);
  assertUniqueIds(missingInformation, "missingInformation", errors);

  for (let i = 0; i < claims.length; i++) {
    validateClaim(claims[i], `claims[${i}]`, errors);
  }
  for (let i = 0; i < missingInformation.length; i++) {
    validateMissing(missingInformation[i], `missingInformation[${i}]`, errors);
  }

  if (errors.length) {
    return { ok: false, errors };
  }
  return { ok: true, value: input as CanonicalStudyProposalV4 };
}

function assertUniqueIds(rows: unknown[], label: string, errors: ContractViolation[]): void {
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== "object") {
      errors.push({ path: `${label}[${i}]`, message: "Expected object." });
      continue;
    }
    const id = (row as { id?: string }).id;
    if (typeof id !== "string" || !id.trim()) {
      errors.push({ path: `${label}[${i}].id`, message: "Required id." });
      continue;
    }
    if (seen.has(id)) {
      errors.push({ path: `${label}[${i}].id`, message: `Duplicate id ${id}.` });
    }
    seen.add(id);
  }
}

function validateClaim(raw: unknown, path: string, errors: ContractViolation[]): void {
  if (!raw || typeof raw !== "object") {
    errors.push({ path, message: "Expected object." });
    return;
  }
  const claim = raw as Record<string, unknown>;
  if (typeof claim.subjectEntityId !== "string" || !claim.subjectEntityId.trim()) {
    errors.push({ path: `${path}.subjectEntityId`, message: "Required." });
  }
  if (!claim.construct || typeof claim.construct !== "object") {
    errors.push({ path: `${path}.construct`, message: "Required construct parts." });
  } else {
    const construct = claim.construct as Record<string, unknown>;
    if (typeof construct.measure !== "string" || !construct.measure.trim()) {
      errors.push({ path: `${path}.construct.measure`, message: "Required snake_case measure." });
    }
  }
  if (typeof claim.modality !== "string" || !CLAIM_MODALITIES.includes(claim.modality as never)) {
    errors.push({ path: `${path}.modality`, message: "Invalid modality." });
  }
  if (!Array.isArray(claim.evidenceRefs) || claim.evidenceRefs.length === 0) {
    errors.push({ path: `${path}.evidenceRefs`, message: "At least one evidence ref required." });
  }
}

function validateMissing(raw: unknown, path: string, errors: ContractViolation[]): void {
  if (!raw || typeof raw !== "object") {
    errors.push({ path, message: "Expected object." });
    return;
  }
  const row = raw as Record<string, unknown>;
  if (typeof row.description !== "string" || !row.description.trim()) {
    errors.push({ path: `${path}.description`, message: "Required." });
  }
  if (typeof row.gapKind !== "string" || !MISSING_GAP_KINDS.includes(row.gapKind as never)) {
    errors.push({ path: `${path}.gapKind`, message: "Invalid gapKind." });
  }
  if (row.gapKind === "field_present_but_empty") {
    if (!Array.isArray(row.evidenceRefs) || row.evidenceRefs.length === 0) {
      errors.push({
        path: `${path}.evidenceRefs`,
        message: "Required when gapKind is field_present_but_empty.",
      });
    }
  }
  if (!row.proposalLineage || typeof row.proposalLineage !== "object") {
    errors.push({ path: `${path}.proposalLineage`, message: "Required." });
  }
}

export function isConflictKind(value: string): value is (typeof CONFLICT_KINDS)[number] {
  return CONFLICT_KINDS.includes(value as (typeof CONFLICT_KINDS)[number]);
}
