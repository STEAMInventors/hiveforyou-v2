import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { debugRoutesDisabledResponse, denyUnlessHiveDebugRoutesEnabled } from "./hive-debug-server";

describe("hive-debug-server", () => {
  const prior = process.env.HIVE_ENABLE_DEBUG_ROUTES;

  beforeEach(() => {
    delete process.env.HIVE_ENABLE_DEBUG_ROUTES;
  });

  afterEach(() => {
    if (prior === undefined) {
      delete process.env.HIVE_ENABLE_DEBUG_ROUTES;
    } else {
      process.env.HIVE_ENABLE_DEBUG_ROUTES = prior;
    }
  });

  it("returns 404 response when disabled", () => {
    expect(denyUnlessHiveDebugRoutesEnabled()?.status).toBe(404);
    process.env.HIVE_ENABLE_DEBUG_ROUTES = "true";
    expect(denyUnlessHiveDebugRoutesEnabled()).toBeNull();
  });

  it("debugRoutesDisabledResponse is empty 404", async () => {
    const response = debugRoutesDisabledResponse();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });
});
