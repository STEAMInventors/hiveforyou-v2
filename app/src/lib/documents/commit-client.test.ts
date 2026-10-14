import { afterEach, describe, expect, it, vi } from "vitest";

import { commitStagedDocuments } from "./commit-client";
import { DocumentCommitError } from "./commit-errors";

describe("commitStagedDocuments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects an unauthenticated upload without treating it as a generic save failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "UNAUTHENTICATED", message: "Sign in is required." }), {
            status: 401,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    await expect(commitStagedDocuments([])).rejects.toEqual(
      expect.any(DocumentCommitError),
    );
    await expect(commitStagedDocuments([])).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("keeps other failures as a document save error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "DOCUMENT_PERSISTENCE_FAILED" }), { status: 500 })),
    );

    await expect(commitStagedDocuments([])).rejects.toMatchObject({
      code: "DOCUMENT_COMMIT_FAILED",
    });
  });
});
