import { describe, expect, it } from "vitest";

import { buildSourceDocumentFileHref } from "./source-document-file-client";

describe("buildSourceDocumentFileHref", () => {
  it("builds file route without page fragment", () => {
    expect(buildSourceDocumentFileHref("run-1", "doc-2")).toBe(
      "/api/study/runs/run-1/sources/doc-2/file",
    );
  });

  it("appends PDF page fragment when page is set", () => {
    expect(buildSourceDocumentFileHref("run-1", "doc-2", 5)).toBe(
      "/api/study/runs/run-1/sources/doc-2/file#page=5",
    );
  });
});
