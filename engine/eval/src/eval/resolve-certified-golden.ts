import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { GOLDEN_SPLITS, isCertifiedGoldenCase, isDraftGoldenCase } from "../golden/types.js";
import { validateGoldenCase } from "../golden/validate.js";
import type { CertifiedGoldenCase } from "../golden/types.js";

export type ResolveGoldenError =
  | { code: "CASE_NOT_FOUND" }
  | { code: "GOLDEN_NOT_CERTIFIED"; reason: "draft" | "unverified" | "invalid"; detail?: string };

const CASE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function isSafeCaseId(caseId: string): boolean {
  return caseId.length > 0 && caseId.length <= 64 && CASE_ID_PATTERN.test(caseId);
}

/**
 * Locate a certified golden under `evalRoot/golden/<split>/<caseId>.json`.
 * Does not read `_review` or other non-split directories.
 */
export function resolveCertifiedGoldenByCaseId(input: {
  evalRoot: string;
  caseId: string;
}):
  | { ok: true; golden: CertifiedGoldenCase }
  | { ok: false; error: ResolveGoldenError } {
  if (!isSafeCaseId(input.caseId)) {
    return { ok: false, error: { code: "CASE_NOT_FOUND" } };
  }

  let foundPath: string | null = null;
  let lastNonCertified: ResolveGoldenError | null = null;

  for (const split of GOLDEN_SPLITS) {
    const filePath = join(input.evalRoot, "golden", split, `${input.caseId}.json`);
    if (!existsSync(filePath)) {
      continue;
    }
    foundPath = filePath;
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    const validated = validateGoldenCase(raw);
    if (!validated.ok) {
      lastNonCertified = {
        code: "GOLDEN_NOT_CERTIFIED",
        reason: "invalid",
        detail: validated.issues.map((i) => i.message).join("; "),
      };
      continue;
    }
    const golden = validated.value;
    if (isDraftGoldenCase(golden)) {
      lastNonCertified = { code: "GOLDEN_NOT_CERTIFIED", reason: "draft" };
      continue;
    }
    if (!isCertifiedGoldenCase(golden)) {
      lastNonCertified = { code: "GOLDEN_NOT_CERTIFIED", reason: "unverified" };
      continue;
    }
    if (golden.caseId !== input.caseId) {
      lastNonCertified = {
        code: "GOLDEN_NOT_CERTIFIED",
        reason: "invalid",
        detail: "caseId mismatch",
      };
      continue;
    }
    return { ok: true, golden };
  }

  if (foundPath && lastNonCertified) {
    return { ok: false, error: lastNonCertified };
  }
  return { ok: false, error: { code: "CASE_NOT_FOUND" } };
}
