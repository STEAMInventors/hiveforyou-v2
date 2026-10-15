import { describe, expect, it } from "vitest";

import { L001_READER_PACK_CONTENT_SHA256 } from "@hiveforyou/core/study";

import { buildStudyReaderRequestFromTrustedPages } from "./document-pages-to-reader-request.js";

describe("buildStudyReaderRequestFromTrustedPages", () => {
  it("includes authoritative proposal pack identity for pack-driven Reader", () => {
    const request = buildStudyReaderRequestFromTrustedPages({
      caseId: "case-1",
      userId: "user-1",
      domainId: "iep",
      proposalPack: {
        packId: "iep",
        packVersion: "0.3.0-proposed",
        packContentSha256: L001_READER_PACK_CONTENT_SHA256,
      },
      studyRunId: "run-1",
      attemptId: "attempt-1",
      bundles: [],
      readerMode: "pack_driven",
    });

    expect(request.packId).toBe("iep");
    expect(request.packVersion).toBe("0.3.0-proposed");
    expect(request.packContentSha256).toBe(L001_READER_PACK_CONTENT_SHA256);
    expect(request.domainId).toBe("iep");
  });
});
