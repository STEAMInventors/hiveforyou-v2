import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { findForbiddenCommittedEnvKeys } from "./committed-env-guard";

const REPO_ROOT = join(process.cwd(), "..");

const COMMITTED_ENV_FILES = [
  join(REPO_ROOT, "app/.env.production"),
  join(REPO_ROOT, "deploy/oracle/worker.config.env"),
] as const;

describe("committed env files", () => {
  it("does not contain secret keys or non-public *_KEY / *_SECRET entries", () => {
    for (const filePath of COMMITTED_ENV_FILES) {
      const content = readFileSync(filePath, "utf8");
      expect(findForbiddenCommittedEnvKeys(content), filePath).toEqual([]);
    }
  });
});