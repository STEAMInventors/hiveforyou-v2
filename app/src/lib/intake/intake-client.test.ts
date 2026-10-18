import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchIntakeRun, isUnrecoverableIntakeStatusError } from "./intake-client";

describe("fetchIntakeRun", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("throws when the API returns HTTP 200 with an error object", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        error: "UNEXPECTED",
        message: "Document understanding could not be read.",
      }),
    } as Response);

    await expect(fetchIntakeRun("run-1")).rejects.toThrow("UNEXPECTED");
  });
});

describe("isUnrecoverableIntakeStatusError", () => {
  it("marks UNEXPECTED as unrecoverable", () => {
    expect(isUnrecoverableIntakeStatusError("UNEXPECTED")).toBe(true);
  });
});