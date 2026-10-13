import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import { computeProposalPackContentSha256 } from "@hiveforyou/domain-pack/pack-driven-reader";
import { describe, expect, it } from "vitest";

import nextConfig from "../../../next.config";

const APP_DIR = join(import.meta.dirname, "..", "..", "..");
const REPO_ROOT = join(APP_DIR, "..");

const READER_HISTORICAL_PACK_SNAPSHOT_HASH =
  "c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775";

function resolveAppRelativeTracePath(relativePath: string): string {
  return join(APP_DIR, ...relativePath.split("/"));
}

describe("Vercel pack trace includes", () => {
  it("bundles the historical Reader snapshot for canonical-study run", () => {
    const includes = nextConfig.outputFileTracingIncludes;
    expect(includes).toBeDefined();

    const canonicalStudyPaths =
      includes?.["/api/case/[caseId]/canonical-study/run"];
    expect(canonicalStudyPaths).toBeDefined();
    expect(canonicalStudyPaths?.length).toBeGreaterThan(0);

    const resolvedPaths = canonicalStudyPaths!.map(resolveAppRelativeTracePath);
    for (const resolvedPath of resolvedPaths) {
      expect(existsSync(resolvedPath), `missing traced pack file: ${resolvedPath}`).toBe(true);
    }

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
});
