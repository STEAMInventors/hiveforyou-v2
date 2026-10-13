import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  L001_READER_PACK_CONTENT_SHA256,
  resolveCanonicalStudyInterpretation,
} from "../resolve-canonical-study-interpretation.js";
import { resolveDebugCanonicalStudyDomainPack } from "../resolve-approved-proposal-domain-pack.js";

const HERE = fileURLToPath(import.meta.url);
const REPO_ROOT = join(HERE, "../../../../../..");

describe("ARCH-05 dual pack identity", () => {
  it("resolves interpretation overlay compatible with L001 reader snapshot", () => {
    const readerPack = resolveDebugCanonicalStudyDomainPack({
      envelopePackId: "iep",
      envelopePackVersion: "0.3.0-proposed",
      envelopePackContentSha256: L001_READER_PACK_CONTENT_SHA256,
    });

    const resolved = resolveCanonicalStudyInterpretation({
      readerPack: readerPack.pack,
      readerPackContentSha256: L001_READER_PACK_CONTENT_SHA256,
      domainId: "iep",
    });

    expect(resolved.overlay.manifest.id).toBe("iep-interp");
    expect(resolved.overlayContentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(resolved.mergedPack.recordTypes.find((r) => r.id === "student")?.identity?.caseSingletonMerge).toBe(
      "guaranteed_unique",
    );
  });
});
