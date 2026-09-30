import { afterEach, describe, expect, it, vi } from "vitest";

import { runDiscoverForStagedDocuments } from "./run-discover-client";
import { createStagedDocuments } from "@/lib/staged-documents";

vi.mock("@/lib/canonical-study/map-start-request", () => ({
  getOrCreateClientCaseId: () => "case-1",
}));

describe("runDiscoverForStagedDocuments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("deduplicates concurrent discover requests for the same case and documents", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ run: { discoverRunId: "run-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const staged = createStagedDocuments([
      new File(["a"], "a.pdf", { type: "application/pdf" }),
    ]);

    const [first, second] = await Promise.all([
      runDiscoverForStagedDocuments(staged),
      runDiscoverForStagedDocuments(staged),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });
});
