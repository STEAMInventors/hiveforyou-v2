import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  findCommittedEnvEncodingIssue,
  findForbiddenCommittedEnvKeys,
  findSharedAppWorkerEnvMismatches,
  FORBIDDEN_COMMITTED_ENV_KEYS,
} from "./committed-env-guard";

const REPO_ROOT = join(process.cwd(), "..");

const COMMITTED_ENV_FILES = [
  join(REPO_ROOT, "app/.env.production"),
  join(REPO_ROOT, "deploy/oracle/worker.config.env"),
] as const;

describe("committed env files", () => {
  it("is UTF-8 on disk (not PowerShell UTF-16)", () => {
    for (const filePath of COMMITTED_ENV_FILES) {
      const raw = readFileSync(filePath);
      expect(findCommittedEnvEncodingIssue(raw), filePath).toBeNull();
    }
    expect(findCommittedEnvEncodingIssue(Buffer.from("HIVE_PIPELINE=inngest\n", "utf8"))).toBeNull();
    expect(findCommittedEnvEncodingIssue(Buffer.from("H\x00I\x00V\x00E\x00", "binary"))).toBe(
      "UTF16_LE",
    );
  });

  it("does not contain secret keys or non-public *_KEY / *_SECRET entries", () => {
    for (const filePath of COMMITTED_ENV_FILES) {
      const content = readFileSync(filePath, "utf8");
      expect(findForbiddenCommittedEnvKeys(content), filePath).toEqual([]);
    }
  });

  it("forbids the preview password and preview user credential in committed env files", () => {
    expect(FORBIDDEN_COMMITTED_ENV_KEYS).toEqual(
      expect.arrayContaining(["HIVE_PREVIEW_PASSWORD", "HIVE_PREVIEW_AUTH_PASSWORD"]),
    );
    expect(
      findForbiddenCommittedEnvKeys(
        "HIVE_PREVIEW_AUTH_PASSWORD=secret\nHIVE_PREVIEW_PASSWORD=gate\nHIVE_PREVIEW_AUTH_EMAIL=preview@example.com\n",
      ),
    ).toEqual([
      "HIVE_PREVIEW_AUTH_EMAIL",
      "HIVE_PREVIEW_AUTH_PASSWORD",
      "HIVE_PREVIEW_PASSWORD",
    ]);
  });

  it("keeps shared app/worker config keys in sync", () => {
    const app = readFileSync(COMMITTED_ENV_FILES[0], "utf8");
    const worker = readFileSync(COMMITTED_ENV_FILES[1], "utf8");
    expect(findSharedAppWorkerEnvMismatches(app, worker)).toEqual([]);
  });
});