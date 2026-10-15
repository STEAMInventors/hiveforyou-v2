// Fail-closed verification for content-addressed Reader proposal pack snapshots.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeProposalPackContentSha256,
  validateProposalDomainPack,
} from "../src/pack-driven-reader/index.js";
import type { ProposalDomainPack } from "../src/pack-driven-reader/types.js";

const MANIFEST_SCHEMA = "hive.domain-pack.proposal-snapshots/1" as const;

type SnapshotManifestEntry = {
  packId: string;
  packVersion: string;
  packContentSha256: string;
  path: string;
};

type SnapshotManifest = {
  schemaVersion: typeof MANIFEST_SCHEMA;
  snapshots: SnapshotManifestEntry[];
};

function discoverSnapshotManifestPaths(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }
  const manifests: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) {
      continue;
    }
    const manifestPath = join(root, entry.name, "snapshots", "manifest.json");
    if (existsSync(manifestPath)) {
      manifests.push(manifestPath);
    }
  }
  return manifests.sort();
}

function resolveMonorepoRoot(): string {
  const override = process.env.HIVE_DOMAIN_PACKS_BRAIN_DIR?.trim();
  if (override) {
    return dirname(dirname(override));
  }
  let current = process.cwd();
  for (let depth = 0; depth < 16; depth += 1) {
    if (discoverSnapshotManifestPaths(join(current, "brain", "domain-packs")).length > 0) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

function domainPacksRoot(): string {
  const override = process.env.HIVE_DOMAIN_PACKS_BRAIN_DIR?.trim();
  if (override) {
    return override;
  }
  return join(resolveMonorepoRoot(), "brain", "domain-packs");
}

function parseManifest(raw: string, manifestPath: string): SnapshotManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`PROPOSAL_PACK_SNAPSHOT_MANIFEST_INVALID:${manifestPath}:json`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`PROPOSAL_PACK_SNAPSHOT_MANIFEST_INVALID:${manifestPath}:shape`);
  }
  const record = parsed as SnapshotManifest;
  if (record.schemaVersion !== MANIFEST_SCHEMA || !Array.isArray(record.snapshots)) {
    throw new Error(`PROPOSAL_PACK_SNAPSHOT_MANIFEST_INVALID:${manifestPath}:schema`);
  }
  return record;
}

function verifySnapshotEntry(input: {
  snapshotsDir: string;
  entry: SnapshotManifestEntry;
  manifestPath: string;
}): void {
  const hash = input.entry.packContentSha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`PROPOSAL_PACK_SNAPSHOT_MANIFEST_INVALID:${input.manifestPath}:hash`);
  }
  const packId = input.entry.packId.trim();
  const packVersion = input.entry.packVersion.trim();
  const relativePath = input.entry.path.trim();
  if (!packId || !packVersion || !relativePath) {
    throw new Error(`PROPOSAL_PACK_SNAPSHOT_MANIFEST_INVALID:${input.manifestPath}:entry`);
  }

  const snapshotPath = join(input.snapshotsDir, relativePath);
  let raw: string;
  try {
    raw = readFileSync(snapshotPath, "utf8");
  } catch {
    throw new Error(`PROPOSAL_PACK_SNAPSHOT_MISSING:${snapshotPath}`);
  }

  let pack: ProposalDomainPack;
  try {
    pack = JSON.parse(raw) as ProposalDomainPack;
  } catch {
    throw new Error(`PROPOSAL_PACK_SNAPSHOT_INVALID:${snapshotPath}:json`);
  }

  const validation = validateProposalDomainPack(pack);
  if (!validation.valid) {
    throw new Error(
      `PROPOSAL_PACK_SNAPSHOT_INVALID:${snapshotPath}:validation:${validation.errors.join(";")}`,
    );
  }
  if (pack.manifest.id !== packId) {
    throw new Error(`PROPOSAL_PACK_SNAPSHOT_ID_MISMATCH:${snapshotPath}`);
  }
  if (pack.manifest.version !== packVersion) {
    throw new Error(`PROPOSAL_PACK_SNAPSHOT_VERSION_MISMATCH:${snapshotPath}`);
  }

  const contentSha256 = computeProposalPackContentSha256(pack).toLowerCase();
  if (contentSha256 !== hash) {
    throw new Error(`PROPOSAL_PACK_SNAPSHOT_HASH_MISMATCH:${snapshotPath}`);
  }

  const hashKeyedPath = join(input.snapshotsDir, `${hash}.json`);
  if (snapshotPath !== hashKeyedPath && !existsSync(hashKeyedPath)) {
    throw new Error(`PROPOSAL_PACK_SNAPSHOT_HASH_KEY_MISSING:${hashKeyedPath}`);
  }
}

function main(): void {
  const root = domainPacksRoot();
  const manifestPaths = discoverSnapshotManifestPaths(root);
  if (manifestPaths.length === 0) {
    throw new Error(`PROPOSAL_PACK_SNAPSHOT_MANIFESTS_MISSING:${root}`);
  }

  for (const manifestPath of manifestPaths) {
    const snapshotsDir = join(manifestPath, "..");
    const manifest = parseManifest(readFileSync(manifestPath, "utf8"), manifestPath);
    if (manifest.snapshots.length === 0) {
      throw new Error(`PROPOSAL_PACK_SNAPSHOT_MANIFEST_EMPTY:${manifestPath}`);
    }
    for (const entry of manifest.snapshots) {
      verifySnapshotEntry({ snapshotsDir, entry, manifestPath });
    }
  }
}

main();
