import { describe, expect, it } from "vitest";

import { assertWorkerStartPolicy } from "./env.js";

describe("assertWorkerStartPolicy", () => {
  it("allows non-production without signing key", () => {
    expect(() =>
      assertWorkerStartPolicy({
        NODE_ENV: "development",
        INNGEST_DEV: "1",
        HIVE_FAULT_INJECT: "extract-once",
      }),
    ).not.toThrow();
  });

  it("requires INNGEST_SIGNING_KEY in production", () => {
    expect(() =>
      assertWorkerStartPolicy({
        NODE_ENV: "production",
      }),
    ).toThrow(/WORKER_INNGEST_SIGNING_KEY_REQUIRED/);
  });

  it("forbids INNGEST_DEV in production", () => {
    expect(() =>
      assertWorkerStartPolicy({
        NODE_ENV: "production",
        INNGEST_SIGNING_KEY: "signing-key",
        INNGEST_DEV: "1",
      }),
    ).toThrow(/WORKER_INNGEST_DEV_FORBIDDEN_IN_PRODUCTION/);
  });

  it("forbids HIVE_FAULT_INJECT in production", () => {
    expect(() =>
      assertWorkerStartPolicy({
        NODE_ENV: "production",
        INNGEST_SIGNING_KEY: "signing-key",
        HIVE_FAULT_INJECT: "extract-once",
      }),
    ).toThrow(/WORKER_FAULT_INJECT_FORBIDDEN_IN_PRODUCTION/);
  });

  it("allows production when policy is satisfied", () => {
    expect(() =>
      assertWorkerStartPolicy({
        NODE_ENV: "production",
        INNGEST_SIGNING_KEY: "signing-key",
      }),
    ).not.toThrow();
  });
});
