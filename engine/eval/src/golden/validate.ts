import {
  CLAIM_MODALITIES,
  MISSING_GAP_KINDS,
  type ClaimModality,
  type MissingGapKind,
} from "@hiveforyou/shared/case-intelligence/4";

import {
  GOLDEN_SPLITS,
  type GoldenCase,
  type GoldenFact,
  type GoldenGap,
  type GoldenSplit,
  type GoldenTripwire,
  type GoldenWordRange,
} from "./types.js";

export type GoldenValidationIssue = {
  path: string;
  message: string;
};

const modalitySet = new Set<string>(CLAIM_MODALITIES);
const gapKindSet = new Set<string>(MISSING_GAP_KINDS);
const splitSet = new Set<string>(GOLDEN_SPLITS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateWordRange(path: string, range: unknown, issues: GoldenValidationIssue[]): void {
  if (!Array.isArray(range) || range.length !== 2) {
    issues.push({ path, message: "wordRange must be a [start, end) tuple" });
    return;
  }
  const [start, end] = range;
  if (typeof start !== "number" || typeof end !== "number" || !Number.isInteger(start) || !Number.isInteger(end)) {
    issues.push({ path, message: "wordRange indices must be integers" });
    return;
  }
  if (start < 0 || end <= start) {
    issues.push({ path, message: "wordRange must satisfy 0 <= start < end" });
  }
}

function validateFact(path: string, fact: unknown, issues: GoldenValidationIssue[]): void {
  if (!isRecord(fact)) {
    issues.push({ path, message: "fact must be an object" });
    return;
  }
  for (const key of ["id", "documentId", "valueKind"] as const) {
    if (typeof fact[key] !== "string" || fact[key].length === 0) {
      issues.push({ path: `${path}.${key}`, message: "required non-empty string" });
    }
  }
  if (typeof fact.pageNumber !== "number" || !Number.isInteger(fact.pageNumber) || fact.pageNumber < 1) {
    issues.push({ path: `${path}.pageNumber`, message: "pageNumber must be a positive integer" });
  }
  validateWordRange(`${path}.wordRange`, fact.wordRange, issues);
  if (fact.value === undefined) {
    issues.push({ path: `${path}.value`, message: "value is required" });
  }
  if (!Array.isArray(fact.acceptableModalities) || fact.acceptableModalities.length === 0) {
    issues.push({ path: `${path}.acceptableModalities`, message: "at least one modality required" });
  } else {
    for (const [i, mod] of (fact.acceptableModalities as unknown[]).entries()) {
      if (typeof mod !== "string" || !modalitySet.has(mod)) {
        issues.push({
          path: `${path}.acceptableModalities[${i}]`,
          message: `invalid modality; expected one of ${CLAIM_MODALITIES.join(", ")}`,
        });
      }
    }
  }
}

function validateGap(path: string, gap: unknown, issues: GoldenValidationIssue[]): void {
  if (!isRecord(gap)) {
    issues.push({ path, message: "gap must be an object" });
    return;
  }
  if (typeof gap.id !== "string" || gap.id.length === 0) {
    issues.push({ path: `${path}.id`, message: "required non-empty string" });
  }
  if (typeof gap.gapKind !== "string" || !gapKindSet.has(gap.gapKind)) {
    issues.push({
      path: `${path}.gapKind`,
      message: `gapKind must be one of ${MISSING_GAP_KINDS.join(", ")}`,
    });
  }
  if (typeof gap.description !== "string" || gap.description.trim().length === 0) {
    issues.push({ path: `${path}.description`, message: "description is required" });
  }
  if (gap.labelWordRange !== undefined) {
    validateWordRange(`${path}.labelWordRange`, gap.labelWordRange, issues);
  }
}

function validateTripwire(path: string, tripwire: unknown, issues: GoldenValidationIssue[]): void {
  if (!isRecord(tripwire)) {
    issues.push({ path, message: "tripwire must be an object" });
    return;
  }
  if (typeof tripwire.id !== "string" || tripwire.id.length === 0) {
    issues.push({ path: `${path}.id`, message: "required non-empty string" });
  }
  if (typeof tripwire.mustNotClaim !== "string" || tripwire.mustNotClaim.trim().length === 0) {
    issues.push({ path: `${path}.mustNotClaim`, message: "mustNotClaim is required" });
  }
}

export function validateGoldenCase(raw: unknown): { ok: true; value: GoldenCase } | { ok: false; issues: GoldenValidationIssue[] } {
  const issues: GoldenValidationIssue[] = [];
  if (!isRecord(raw)) {
    return { ok: false, issues: [{ path: "", message: "golden case must be an object" }] };
  }

  if (typeof raw.caseId !== "string" || raw.caseId.length === 0) {
    issues.push({ path: "caseId", message: "required non-empty string" });
  }
  if (typeof raw.split !== "string" || !splitSet.has(raw.split)) {
    issues.push({
      path: "split",
      message: `split must be one of ${GOLDEN_SPLITS.join(", ")}`,
    });
  }
  if (typeof raw.corpusDir !== "string" || raw.corpusDir.length === 0) {
    issues.push({ path: "corpusDir", message: "required non-empty string" });
  }

  const verifiedBy = raw.verifiedBy;
  const draft = raw.draft;
  const certified =
    typeof verifiedBy === "string" && verifiedBy.trim().length > 0 && draft !== true;
  const draftOk = verifiedBy === null && draft === true;

  if (!certified && !draftOk) {
    issues.push({
      path: "verifiedBy",
      message:
        "certified goldens require non-empty verifiedBy; drafts require verifiedBy: null and draft: true",
    });
  }

  if (!Array.isArray(raw.facts)) {
    issues.push({ path: "facts", message: "facts must be an array" });
  } else {
    raw.facts.forEach((fact, i) => validateFact(`facts[${i}]`, fact, issues));
  }

  if (!Array.isArray(raw.gaps)) {
    issues.push({ path: "gaps", message: "gaps must be an array" });
  } else {
    raw.gaps.forEach((gap, i) => validateGap(`gaps[${i}]`, gap, issues));
  }

  if (!Array.isArray(raw.tripwires)) {
    issues.push({ path: "tripwires", message: "tripwires must be an array" });
  } else {
    raw.tripwires.forEach((tw, i) => validateTripwire(`tripwires[${i}]`, tw, issues));
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, value: raw as GoldenCase };
}

export function assertGoldenSplit(split: string): split is GoldenSplit {
  return splitSet.has(split);
}

export function parseGoldenFactModalities(modalities: ClaimModality[]): GoldenFact["acceptableModalities"] {
  return modalities.filter((m): m is ClaimModality => modalitySet.has(m));
}

export function parseGapKind(kind: string): MissingGapKind | null {
  return gapKindSet.has(kind) ? (kind as MissingGapKind) : null;
}

export type { GoldenWordRange };
