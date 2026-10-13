import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  computeProposalPackContentSha256,
  validateProposalDomainPack,
} from "@hiveforyou/domain-pack/pack-driven-reader";
import { describe, expect, it } from "vitest";

import { SYNTHETIC_PACK } from "./canonical-study/test-fixtures.js";
import { hiveMonorepoRoot } from "./resolve-hive-monorepo-root.js";
import {
  CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
  PackNotAvailableError,
  PackNotReadyError,
  resolveApprovedProposalDomainPack,
  resolveDebugCanonicalStudyDomainPack,
} from "./resolve-approved-proposal-domain-pack.js";

describe("resolveApprovedProposalDomainPack", () => {
  it("returns PACK_NOT_READY when no approved pack path is configured", () => {
    expect(() => resolveApprovedProposalDomainPack({})).toThrow(PackNotReadyError);
  });

  it("rejects the proposed v0.3 pack path explicitly", () => {
    const proposedPath = join(
      hiveMonorepoRoot(),
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

describe("resolveDebugCanonicalStudyDomainPack", () => {
  it("returns PACK_NOT_AVAILABLE for unknown pack coordinates", () => {
    expect(() =>
      resolveDebugCanonicalStudyDomainPack({
        envelopePackId: "unknown",
        envelopePackVersion: "0.0.0",
        envelopePackContentSha256: "a".repeat(64),
      }),
    ).toThrow(PackNotAvailableError);
  });

  it("loads iep@0.3.0-proposed when envelope hash matches the Reader pack", () => {
    const proposedPath = join(
      hiveMonorepoRoot(),
      "brain",
      "domain-packs",
      "iep",
      "iep-pack.v0.3.proposed.json",
    );
    const pack = JSON.parse(readFileSync(proposedPath, "utf8")) as typeof SYNTHETIC_PACK;

    const loaded = resolveDebugCanonicalStudyDomainPack({
      envelopePackId: pack.manifest.id,
      envelopePackVersion: pack.manifest.version,
      envelopePackContentSha256: computeProposalPackContentSha256(pack).toLowerCase(),
    });

    expect(loaded.pack.manifest.id).toBe("iep");
    expect(loaded.pack.manifest.version).toBe("0.3.0-proposed");
    expect(loaded.packApprovalLabel).toBe(CANONICAL_STUDY_DEBUG_PACK_APPROVAL);
  });

  it("loads a Reader override pack when id, version, and hash match", () => {
    const dir = mkdtempSync(join(tmpdir(), "hive-debug-pack-"));
    try {
      const packPath = join(dir, "debug-pack.json");
      writeFileSync(
        packPath,
        JSON.stringify({
          ...SYNTHETIC_PACK,
          readingNotes: { ...SYNTHETIC_PACK.readingNotes, global: "debug test pack" },
        }),
        "utf8",
      );
      const parsedPack = JSON.parse(readFileSync(packPath, "utf8"));

      const loaded = resolveDebugCanonicalStudyDomainPack({
        envelopePackId: parsedPack.manifest.id,
        envelopePackVersion: parsedPack.manifest.version,
        envelopePackContentSha256: computeProposalPackContentSha256(parsedPack).toLowerCase(),
        env: { HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON: packPath },
      });

      expect(loaded.path).toBe(packPath);
      expect(loaded.packApprovalLabel).toBe(CANONICAL_STUDY_DEBUG_PACK_APPROVAL);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns PACK_NOT_AVAILABLE when hash does not match", () => {
    const dir = mkdtempSync(join(tmpdir(), "hive-debug-pack-"));
    try {
      const packPath = join(dir, "debug-pack.json");
      writeFileSync(packPath, JSON.stringify(SYNTHETIC_PACK), "utf8");

      expect(() =>
        resolveDebugCanonicalStudyDomainPack({
          envelopePackId: SYNTHETIC_PACK.manifest.id,
          envelopePackVersion: SYNTHETIC_PACK.manifest.version,
          envelopePackContentSha256: "b".repeat(64),
          env: { HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON: packPath },
        }),
      ).toThrow(PackNotAvailableError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
