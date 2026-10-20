import { describe, expect, it } from "vitest";

import {
  ReaderProposalPackBindingError,
  resolveDefaultProposalPackIdentityForDomain,
  resolveProposalPackIdentityFromContentHash,
  resolveStudyReaderProposalPackBinding,
} from "./resolve-proposal-pack-identity.js";
import {
  IEP_CANDIDATE_READER_PACK_CONTENT_SHA256,
  L001_READER_PACK_CONTENT_SHA256,
} from "./resolve-canonical-study-interpretation.js";

describe("resolve-proposal-pack-identity", () => {
  it("resolves IEP snapshot identity from manifest by hash", () => {
    const identity = resolveProposalPackIdentityFromContentHash({
      domainId: "iep",
      packContentSha256: L001_READER_PACK_CONTENT_SHA256,
    });
    expect(identity.packId).toBe("iep");
    expect(identity.packVersion).toBe("0.3.0-proposed");
    expect(identity.packContentSha256).toBe(L001_READER_PACK_CONTENT_SHA256);
  });

  it("resolves DP-03B candidate digest as default IEP identity when multiple snapshots are registered", () => {
    const identity = resolveDefaultProposalPackIdentityForDomain("iep");
    expect(identity.packContentSha256).toBe(IEP_CANDIDATE_READER_PACK_CONTENT_SHA256);
    expect(identity.packContentSha256).not.toBe(L001_READER_PACK_CONTENT_SHA256);
  });

  it("binds study context hash to manifest entry", () => {
    const identity = resolveStudyReaderProposalPackBinding({
      domainId: "iep",
      proposalPackContentSha256: L001_READER_PACK_CONTENT_SHA256,
    });
    expect(identity.packId).toBe("iep");
  });

  it("rejects wrong hash", () => {
    expect(() =>
      resolveProposalPackIdentityFromContentHash({
        domainId: "iep",
        packContentSha256: "b".repeat(64),
      }),
    ).toThrow(ReaderProposalPackBindingError);
  });

  it("rejects missing study hash", () => {
    expect(() =>
      resolveStudyReaderProposalPackBinding({
        domainId: "iep",
        proposalPackContentSha256: "",
      }),
    ).toThrow(ReaderProposalPackBindingError);
  });
});
