import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const PROPOSAL_PACK_SNAPSHOT_MANIFEST_SCHEMA =
  "hive.domain-pack.proposal-snapshots/1" as const;

const BRAIN_DOMAIN_PACKS = join("brain", "domain-packs");

export function collectProposalPackSnapshotBrainRelativePaths(repoRoot: string): string[] {
  const domainPacksDir = join(repoRoot, BRAIN_DOMAIN_PACKS);
  if (!existsSync(domainPacksDir)) {
    return [];
  }

  const paths = new Set<string>();

  for (const entry of readdirSync(domainPacksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) {
      continue;
    }
    const snapshotsDir = join(domainPacksDir, entry.name, "snapshots");
    const manifestPath = join(snapshotsDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      continue;
    }

    assertSnapshotManifest(manifestPath);

    paths.add(toPosixRelative(repoRoot, manifestPath));

    for (const file of readdirSync(snapshotsDir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".json") || file.name === "manifest.json") {
        continue;
      }
      paths.add(toPosixRelative(repoRoot, join(snapshotsDir, file.name)));
    }
  }

  return [...paths].sort();
}

export function toAppRelativeTracePaths(
  appDir: string,
  brainRelativePaths: string[],
  repoRoot: string,
): string[] {
  return brainRelativePaths.map((brainRelative) => {
    const absolute = join(repoRoot, ...brainRelative.split("/"));
    const rel = toPosixRelative(appDir, absolute);
    return rel.startsWith("..") ? rel : `./${rel}`;
  });
}

function assertSnapshotManifest(manifestPath: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
  } catch {
    throw new Error(`Invalid proposal pack snapshot manifest JSON: ${manifestPath}`);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as Record<string, unknown>).schemaVersion !== PROPOSAL_PACK_SNAPSHOT_MANIFEST_SCHEMA
  ) {
    throw new Error(`Unsupported proposal pack snapshot manifest schema: ${manifestPath}`);
  }
}

function toPosixRelative(from: string, to: string): string {
  return relative(from, to).split("\\").join("/");
}
