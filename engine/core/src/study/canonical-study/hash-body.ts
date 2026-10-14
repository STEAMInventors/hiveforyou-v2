import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { CanonicalStudyArtifactBody } from "@hiveforyou/shared/canonical-study-artifact";

import { hashCanonicalJson } from "../fingerprint.js";

export const CANONICAL_STUDY_RULESET_SOURCE_FILES = [
  "canonical-study-foundation/build-artifact.ts",
  "canonical-study-foundation/comparison-normalize.ts",
  "canonical-study-foundation/flatten-proposed-fields.ts",
  "canonical-study-foundation/group-records.ts",
  "canonical-study-foundation/verify-proposed-field.ts",
  "canonical-study-foundation/normalize-verified-field.ts",
  "canonical-study-foundation/order-documents-and-records.ts",
  "canonical-study-foundation/field-key.ts",
  "canonical-study-foundation/primitives.ts",
  "canonical-study-foundation/hash-body.ts",
  "canonical-study-foundation/index.ts",
  "canonical-study/evaluate-source-coverage.ts",
  "canonical-study/indexed-foundation.ts",
  "canonical-study/resolve-identity.ts",
  "canonical-study/compose-operative-views.ts",
  "canonical-study/label-relations.ts",
  "canonical-study/build-series.ts",
  "canonical-study/evaluate-requirements.ts",
  "canonical-study/evaluate-insight-checks.ts",
  "canonical-study/evaluate-primitives.ts",
  "canonical-study/construct-keys.ts",
  "canonical-study/temporal-succession.ts",
  "canonical-study/stable-id.ts",
  "canonical-study/hash-body.ts",
] as const;

const STUDY_ROOT = join(import.meta.dirname, "..");

export function computeCanonicalStudyRulesetContentSha256(): string {
  const hash = createHash("sha256");
  for (const relativePath of CANONICAL_STUDY_RULESET_SOURCE_FILES) {
    const normalizedPath = relativePath.replace(/\\/g, "/");
    const content = readFileSync(join(STUDY_ROOT, relativePath), "utf8").replace(/\r\n/g, "\n");
    hash.update(`${normalizedPath}\n`);
    hash.update(content);
  }
  return hash.digest("hex");
}

export function hashCanonicalStudyBody(body: CanonicalStudyArtifactBody): string {
  return hashCanonicalJson(body);
}
