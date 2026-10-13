import { describe, expect, it } from "vitest";

import { L001_READER_PACK_CONTENT_SHA256 } from "./resolve-canonical-study-interpretation.js";
import { resolveInterpretationOverlayPath } from "./interpretation-overlay-catalog.js";

describe("interpretation overlay catalog", () => {
  it("resolves IEP overlay by reader pack content hash without hardcoded domain defaults", () => {
    const resolved = resolveInterpretationOverlayPath({
      readerPackContentSha256: L001_READER_PACK_CONTENT_SHA256,
      domainId: "iep",
    });
    expect(resolved).not.toBeNull();
    expect(resolved?.overlayPath).toContain("iep-interp-v0.3.1.overlay.json");
    expect(resolved?.domainFolder).toBe("iep");
  });

  it("returns null when no compatibility entry exists", () => {
    expect(
      resolveInterpretationOverlayPath({
        readerPackContentSha256: "f".repeat(64),
        domainId: "iep",
      }),
    ).toBeNull();
  });
});
