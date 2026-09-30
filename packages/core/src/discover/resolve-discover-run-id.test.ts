import { describe, expect, it } from "vitest";

import type { HiveDiscoverRun } from "@hiveforyou/shared/discover";

import { resolveDiscoverRunIdForRetry } from "./resolve-discover-run-id";

function existingRun(status: HiveDiscoverRun["status"]): HiveDiscoverRun {
  return {
    discoverRunId: "db-run",
    caseId: "case-1",
    idempotencyKey: "idem-1",
    providerId: "openai",
    providerMode: "production",
    promptId: "discover",
    promptVersion: "v1",
    promptSha256: "abc",
    domainPackId: "unknown",
    domainPackVersion: "unknown",
    startedAt: "2026-09-28T00:00:00.000Z",
    status,
  };
}

describe("resolveDiscoverRunIdForRetry", () => {
  it("reuses the existing database id for any persisted run", () => {
    expect(resolveDiscoverRunIdForRetry(existingRun("FAILED"), () => "new-run")).toBe("db-run");
    expect(resolveDiscoverRunIdForRetry(existingRun("RUNNING"), () => "new-run")).toBe("db-run");
  });

  it("generates an id only when no row exists", () => {
    expect(resolveDiscoverRunIdForRetry(null, () => "new-run")).toBe("new-run");
  });
});
