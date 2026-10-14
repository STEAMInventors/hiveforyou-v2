import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CANONICAL_STUDY_RULESET_CONTENT_SHA256 } from "./ruleset-pin.js";

const STUDY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function listRulesetSourceFiles(): string[] {
  const files: string[] = [];
  for (const subdir of ["canonical-study-foundation", "canonical-study"] as const) {
    const dir = join(STUDY_ROOT, subdir);
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".ts")) {
        continue;
      }
      if (name.endsWith(".test.ts") || name === "ruleset-pin.ts") {
        continue;
      }
      files.push(join(dir, name));
    }
  }
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function computeCanonicalStudyRulesetContentSha256(): string {
  const hash = createHash("sha256");
  for (const absolutePath of listRulesetSourceFiles()) {
    const relativePath = relative(STUDY_ROOT, absolutePath).replace(/\\/g, "/");
    const content = readFileSync(absolutePath, "utf8").replace(/\r\n/g, "\n");
    hash.update(`${relativePath}\n`);
    hash.update(content);
  }
  return hash.digest("hex");
}

describe("canonical study ruleset pin", () => {
  it("matches builder source hash", () => {
    const computed = computeCanonicalStudyRulesetContentSha256();
    expect(computed).toBe(CANONICAL_STUDY_RULESET_CONTENT_SHA256);
  });
});