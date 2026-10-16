import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import { computeProposalPackContentSha256 } from "@hiveforyou/domain-pack/pack-driven-reader";
import {
  readProposalPackSnapshotManifest,
  resolveProposalPackIdentityFromContentHash,
} from "@hiveforyou/core";
import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";
import {
  collectProposalPackSnapshotBrainRelativePaths,
  PROPOSAL_PACK_SNAPSHOT_MANIFEST_SCHEMA,
} from "./collect-proposal-pack-snapshot-trace-paths";

const APP_DIR = join(import.meta.dirname, "..", "..", "..");
const REPO_ROOT = join(APP_DIR, "..");

const READER_HISTORICAL_PACK_SNAPSHOT_HASH =
  "c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775";

const HIVE_WRITER_SHADOW_ROUTES = [
  "/api/case/[caseId]/hive-writer-shadow/run",
  "/api/case/[caseId]/hive-writer-shadow/status",
  "/api/case/[caseId]/hive-writer-shadow/ui-tree",
] as const;

function resolveAppRelativeTracePath(relativePath: string): string {
  return join(APP_DIR, ...relativePath.split("/"));
}

function assertTracedPathsExist(routeKey: string, relativePaths: readonly string[] | undefined): void {
  expect(relativePaths, `${routeKey} must declare outputFileTracingIncludes`).toBeDefined();
  expect(relativePaths?.length).toBeGreaterThan(0);

  const resolvedPaths = relativePaths!.map(resolveAppRelativeTracePath);
  for (const resolvedPath of resolvedPaths) {
    expect(existsSync(resolvedPath), `missing traced pack file: ${resolvedPath}`).toBe(true);
  }
}

describe("Vercel pack trace includes", () => {
  it("discovers immutable snapshot registries domain-agnostically from brain/domain-packs", () => {
    const brainPaths = collectProposalPackSnapshotBrainRelativePaths(REPO_ROOT);
    expect(brainPaths.length).toBeGreaterThan(0);
    expect(brainPaths).toContain("brain/domain-packs/iep/snapshots/manifest.json");
    expect(brainPaths).toContain(
      `brain/domain-packs/iep/snapshots/${READER_HISTORICAL_PACK_SNAPSHOT_HASH}.json`,
    );

    const manifestPath = join(
      REPO_ROOT,
      "brain",
      "domain-packs",
      "iep",
      "snapshots",
      "manifest.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      schemaVersion: string;
    };
    expect(manifest.schemaVersion).toBe(PROPOSAL_PACK_SNAPSHOT_MANIFEST_SCHEMA);
  });

  it("bundles verified proposal pack snapshots for canonical-study run", () => {
    const includes = nextConfig.outputFileTracingIncludes;
    assertTracedPathsExist(
      "/api/case/[caseId]/canonical-study/run",
      includes?.["/api/case/[caseId]/canonical-study/run"],
    );

    const canonicalStudyPaths =
      includes?.["/api/case/[caseId]/canonical-study/run"] ?? [];
    const resolvedPaths = canonicalStudyPaths.map(resolveAppRelativeTracePath);

    const snapshotPath = join(
      REPO_ROOT,
      "brain",
      "domain-packs",
      "iep",
      "snapshots",
      `${READER_HISTORICAL_PACK_SNAPSHOT_HASH}.json`,
    );
    expect(resolvedPaths).toContain(snapshotPath);

    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as ProposalDomainPack;
    expect(snapshot.manifest.id).toBe("iep");
    expect(snapshot.manifest.version).toBe("0.3.0-proposed");
    expect(computeProposalPackContentSha256(snapshot).toLowerCase()).toBe(
      READER_HISTORICAL_PACK_SNAPSHOT_HASH,
    );
  });

  it("bundles snapshot manifest and content-addressed files for hive-writer-shadow routes", () => {
    const includes = nextConfig.outputFileTracingIncludes;
    const manifestRepoPath = join(
      REPO_ROOT,
      "brain",
      "domain-packs",
      "iep",
      "snapshots",
      "manifest.json",
    );

    for (const route of HIVE_WRITER_SHADOW_ROUTES) {
      const traced = includes?.[route];
      assertTracedPathsExist(route, traced);
      const resolvedPaths = traced!.map(resolveAppRelativeTracePath);
      expect(resolvedPaths, `${route} must trace snapshot manifest`).toContain(manifestRepoPath);
    }
  });

  it("Writer resolver can load verified snapshot metadata from traced brain assets (Vercel layout)", () => {
    const env = {
      HIVE_DOMAIN_PACKS_BRAIN_DIR: join(REPO_ROOT, "brain", "domain-packs"),
    };
    const manifest = readProposalPackSnapshotManifest("iep", env);
    expect(manifest?.snapshots.length).toBeGreaterThan(0);

    const identity = resolveProposalPackIdentityFromContentHash({
      domainId: "iep",
      packContentSha256: READER_HISTORICAL_PACK_SNAPSHOT_HASH,
      env,
    });
    expect(identity.packId).toBe("iep");
    expect(identity.packContentSha256).toBe(READER_HISTORICAL_PACK_SNAPSHOT_HASH);

    const snapshotPath = join(
      REPO_ROOT,
      "brain",
      "domain-packs",
      "iep",
      "snapshots",
      `${READER_HISTORICAL_PACK_SNAPSHOT_HASH}.json`,
    );
    expect(existsSync(snapshotPath)).toBe(true);
  });
});
