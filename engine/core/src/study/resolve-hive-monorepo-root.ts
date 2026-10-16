import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Relative to monorepo root; used for discovery and Next output file tracing. */
export const PROPOSAL_PACK_RELATIVE_PATH = join(
  "brain",
  "domain-packs",
  "iep",
  "iep-pack.v0.3.proposed.json",
);

function hasProposalPackSnapshotRegistryAtRoot(root: string): boolean {
  const domainPacksDir = join(root, "brain", "domain-packs");
  if (!existsSync(domainPacksDir)) {
    return false;
  }
  for (const entry of readdirSync(domainPacksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) {
      continue;
    }
    if (existsSync(join(domainPacksDir, entry.name, "snapshots", "manifest.json"))) {
      return true;
    }
  }
  return false;
}

function hasProposalPackAtRoot(root: string): boolean {
  return (
    existsSync(join(root, PROPOSAL_PACK_RELATIVE_PATH)) ||
    hasProposalPackSnapshotRegistryAtRoot(root)
  );
}

function walkUpForProposalPack(startDir: string, maxDepth = 16): string | null {
  let current = startDir;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (hasProposalPackAtRoot(current)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

/** Legacy layout: `engine/core/src/study` -> four levels up is monorepo root in dev. */
function legacyCoreRepoRootFromModuleUrl(moduleUrl: string): string {
  return join(dirname(fileURLToPath(moduleUrl)), "..", "..", "..", "..");
}

/**
 * Monorepo root for runtime file assets (domain packs, fixtures).
 * Prefers `process.cwd()` so Vercel serverless layouts find traced `brain/` trees;
 * falls back to walking from the module URL (local TypeScript / workspace dev).
 */
export function resolveHiveMonorepoRoot(moduleUrl: string = import.meta.url): string {
  const fromCwd = walkUpForProposalPack(process.cwd());
  if (fromCwd) {
    return fromCwd;
  }
  const fromModule = walkUpForProposalPack(dirname(fileURLToPath(moduleUrl)));
  if (fromModule) {
    return fromModule;
  }
  return legacyCoreRepoRootFromModuleUrl(moduleUrl);
}

export function hiveMonorepoRoot(): string {
  return resolveHiveMonorepoRoot();
}
