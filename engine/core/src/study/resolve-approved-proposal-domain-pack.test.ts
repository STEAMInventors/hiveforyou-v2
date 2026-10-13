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
  collectProposalPackSnapshotCandidatePaths,
  proposalPackSnapshotPathForHash,
  resolveApprovedProposalDomainPack,
  resolveDebugCanonicalStudyDomainPack,
} from "./resolve-approved-proposal-domain-pack.js";

const READER_EXTRACTION_PACK_SHA256 =
  "c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775";

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

describe("proposal pack snapshots", () => {
  it("resolves the committed Reader extraction snapshot path by hash", () => {
    const path = proposalPackSnapshotPathForHash(READER_EXTRACTION_PACK_SHA256);
    expect(path).toBe(
      join(
        hiveMonorepoRoot(),
        "brain",
        "domain-packs",
        "iep",
        "snapshots",
        `${READER_EXTRACTION_PACK_SHA256}.json`,
      ),
    );
  });

  it("includes the hash-keyed snapshot in candidate paths for iep@0.3.0-proposed", () => {
    const paths = collectProposalPackSnapshotCandidatePaths({
      envelopePackId: "iep",
      envelopePackVersion: "0.3.0-proposed",
      envelopeHash: READER_EXTRACTION_PACK_SHA256,
    });
    expect(paths.some((path) => path.endsWith(`${READER_EXTRACTION_PACK_SHA256}.json`))).toBe(
      true,
    );
  });
});

describe("resolveDebugCanonicalStudyDomainPack", () => {
  it("returns PACK_NOT_AVAILABLE for unknown pack coordinates", () => {
    try {
      resolveDebugCanonicalStudyDomainPack({
        envelopePackId: "unknown",
        envelopePackVersion: "0.0.0",
        envelopePackContentSha256: "a".repeat(64),
      });
      expect.unreachable("expected PackNotAvailableError");
    } catch (error) {
      expect(error).toBeInstanceOf(PackNotAvailableError);
      const packError = error as PackNotAvailableError;
      expect(packError.diagnostics.envelopePackId).toBe("unknown");
      expect(packError.diagnostics.compatibilityErrors.length).toBeGreaterThan(0);
    }
  });

  it("loads iep@0.3.0-proposed from historical snapshot when envelope hash matches Reader extraction", () => {
    const envelopeHash =
      "c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775";
    const loaded = resolveDebugCanonicalStudyDomainPack({
      envelopePackId: "iep",
      envelopePackVersion: "0.3.0-proposed",
      envelopePackContentSha256: envelopeHash,
    });

    expect(loaded.pack.manifest.id).toBe("iep");
    expect(loaded.pack.manifest.version).toBe("0.3.0-proposed");
    expect(loaded.contentSha256).toBe(envelopeHash);
    expect(loaded.source).toBe("snapshot");
    expect(loaded.path).toContain(envelopeHash);
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

      try {
        resolveDebugCanonicalStudyDomainPack({
          envelopePackId: SYNTHETIC_PACK.manifest.id,
          envelopePackVersion: SYNTHETIC_PACK.manifest.version,
          envelopePackContentSha256: "b".repeat(64),
          env: { HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON: packPath },
        });
        expect.unreachable("expected PackNotAvailableError");
      } catch (error) {
        expect(error).toBeInstanceOf(PackNotAvailableError);
        const packError = error as PackNotAvailableError;
        expect(packError.diagnostics.expectedSnapshotPath).toContain("b".repeat(64));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
