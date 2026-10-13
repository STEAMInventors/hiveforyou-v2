import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SYNTHETIC_PACK } from "./canonical-study/test-fixtures.js";
import {
  PackNotReadyError,
  resolveApprovedProposalDomainPack,
} from "./resolve-approved-proposal-domain-pack.js";

describe("resolveApprovedProposalDomainPack", () => {
  it("returns PACK_NOT_READY when no approved pack path is configured", () => {
    expect(() => resolveApprovedProposalDomainPack({})).toThrow(PackNotReadyError);
  });

  it("rejects the proposed v0.3 pack path explicitly", () => {
    const proposedPath = join(
      process.cwd(),
      "brain",
      "domain-packs",
      "iep",
      "iep-pack.v0.3.proposed.json",
    );
    expect(() =>
      resolveApprovedProposalDomainPack({
        HIVE_CANONICAL_STUDY_APPROVED_PACK_JSON: proposedPath,
      }),
    ).toThrow(PackNotReadyError);
  });

  it("loads an approved runtime-compatible pack from env", () => {
    const dir = mkdtempSync(join(tmpdir(), "hive-approved-pack-"));
    try {
      const packPath = join(dir, "approved-pack.json");
      writeFileSync(
        packPath,
        JSON.stringify({
          ...SYNTHETIC_PACK,
          status: "APPROVED_RUNTIME_COMPATIBLE",
          readingNotes: { ...SYNTHETIC_PACK.readingNotes, global: "approved test pack" },
        }),
        "utf8",
      );
      writeFileSync(
        join(dir, "review-check.json"),
        JSON.stringify({ runtimeCompatible: true, packStatus: "APPROVED_RUNTIME_COMPATIBLE" }),
        "utf8",
      );

      const loaded = resolveApprovedProposalDomainPack({
        HIVE_CANONICAL_STUDY_APPROVED_PACK_JSON: packPath,
      });
      expect(loaded.pack.manifest.id).toBe(SYNTHETIC_PACK.manifest.id);
      expect(loaded.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
