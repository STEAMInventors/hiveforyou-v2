import { readFileSync } from "node:fs";
import { join } from "node:path";

import { hiveMonorepoRoot } from "./resolve-hive-monorepo-root.js";

export const PROPOSAL_PACK_SNAPSHOT_MANIFEST_SCHEMA =
  "hive.domain-pack.proposal-snapshots/1" as const;

const SHA256_HEX = /^[a-f0-9]{64}$/;

export type ProposalPackSnapshotManifestEntry = {
  packId: string;
  packVersion: string;
  packContentSha256: string;
  path?: string;
};

export type ProposalPackIdentity = {
  packId: string;
  packVersion: string;
  packContentSha256: string;
};

export class ReaderProposalPackBindingError extends Error {
  readonly code = "READER_PROPOSAL_PACK_BINDING_UNAVAILABLE" as const;

  constructor(message: string) {
    super(message);
    this.name = "ReaderProposalPackBindingError";
  }
}

function domainPacksBrainDir(env: Record<string, string | undefined> = process.env): string {
  const override = env.HIVE_DOMAIN_PACKS_BRAIN_DIR?.trim();
  if (override) {
    return override;
  }
  return join(hiveMonorepoRoot(), "brain", "domain-packs");
}

export function readProposalPackSnapshotManifest(
  domainId: string,
  env: Record<string, string | undefined> = process.env,
): { snapshots: ProposalPackSnapshotManifestEntry[] } | null {
  const manifestPath = join(
    domainPacksBrainDir(env),
    domainId,
    "snapshots",
    "manifest.json",
  );
  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ReaderProposalPackBindingError(
      `Invalid proposal pack snapshot manifest: ${manifestPath}`,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ReaderProposalPackBindingError(
      `Invalid proposal pack snapshot manifest shape: ${manifestPath}`,
    );
  }
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== PROPOSAL_PACK_SNAPSHOT_MANIFEST_SCHEMA) {
    throw new ReaderProposalPackBindingError(
      `Unsupported proposal pack snapshot manifest schema: ${manifestPath}`,
    );
  }
  const snapshots = record.snapshots;
  if (!Array.isArray(snapshots)) {
    throw new ReaderProposalPackBindingError(
      `Invalid proposal pack snapshot manifest entries: ${manifestPath}`,
    );
  }
  const normalized: ProposalPackSnapshotManifestEntry[] = [];
  for (const entry of snapshots) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const row = entry as Record<string, unknown>;
    const packId = typeof row.packId === "string" ? row.packId.trim() : "";
    const packVersion = typeof row.packVersion === "string" ? row.packVersion.trim() : "";
    const packContentSha256 =
      typeof row.packContentSha256 === "string"
        ? row.packContentSha256.trim().toLowerCase()
        : "";
    if (!packId || !packVersion || !SHA256_HEX.test(packContentSha256)) {
      continue;
    }
    normalized.push({
      packId,
      packVersion,
      packContentSha256,
      path: typeof row.path === "string" ? row.path.trim() : undefined,
    });
  }
  return { snapshots: normalized };
}

export function resolveProposalPackIdentityFromContentHash(input: {
  domainId: string;
  packContentSha256: string;
  env?: Record<string, string | undefined>;
}): ProposalPackIdentity {
  const env = input.env ?? process.env;
  const domainId = input.domainId.trim();
  const hash = input.packContentSha256.trim().toLowerCase();
  if (!domainId) {
    throw new ReaderProposalPackBindingError("domainId is required for proposal pack binding.");
  }
  if (!SHA256_HEX.test(hash)) {
    throw new ReaderProposalPackBindingError("packContentSha256 must be a lowercase SHA-256 hex digest.");
  }

  const manifest = readProposalPackSnapshotManifest(domainId, env);
  if (!manifest || manifest.snapshots.length === 0) {
    throw new ReaderProposalPackBindingError(
      `No proposal pack snapshot registry is available for domain ${domainId}.`,
    );
  }

  const matches = manifest.snapshots.filter((entry) => entry.packContentSha256 === hash);
  if (matches.length !== 1) {
    throw new ReaderProposalPackBindingError(
      matches.length === 0
        ? `No snapshot manifest entry matches packContentSha256 for domain ${domainId}.`
        : `Ambiguous snapshot manifest entries match packContentSha256 for domain ${domainId}.`,
    );
  }
  const entry = matches[0]!;
  if (entry.packId !== domainId) {
    throw new ReaderProposalPackBindingError(
      `Snapshot packId ${entry.packId} does not match domainId ${domainId}.`,
    );
  }
  return {
    packId: entry.packId,
    packVersion: entry.packVersion,
    packContentSha256: entry.packContentSha256,
  };
}

/** Default immutable Reader proposal pack identity when a single snapshot is registered for the domain. */
export function resolveDefaultProposalPackIdentityForDomain(
  domainId: string,
  env: Record<string, string | undefined> = process.env,
): ProposalPackIdentity {
  const manifest = readProposalPackSnapshotManifest(domainId, env);
  if (!manifest || manifest.snapshots.length === 0) {
    throw new ReaderProposalPackBindingError(
      `No proposal pack snapshot registry is available for domain ${domainId}.`,
    );
  }
  const forDomain = manifest.snapshots.filter((entry) => entry.packId === domainId.trim());
  const pool = forDomain.length > 0 ? forDomain : manifest.snapshots;
  if (pool.length !== 1) {
    throw new ReaderProposalPackBindingError(
      `Ambiguous proposal pack snapshot identity for domain ${domainId}; bind an explicit packContentSha256.`,
    );
  }
  const entry = pool[0]!;
  return {
    packId: entry.packId,
    packVersion: entry.packVersion,
    packContentSha256: entry.packContentSha256,
  };
}

export function resolveStudyReaderProposalPackBinding(input: {
  domainId: string;
  proposalPackContentSha256?: string | null;
  env?: Record<string, string | undefined>;
}): ProposalPackIdentity {
  const hash = input.proposalPackContentSha256?.trim().toLowerCase();
  if (!hash) {
    throw new ReaderProposalPackBindingError(
      "Study processingPolicy.proposalPackContentSha256 is required before invoking Reader.",
    );
  }
  return resolveProposalPackIdentityFromContentHash({
    domainId: input.domainId,
    packContentSha256: hash,
    env: input.env,
  });
}

export function proposalPackSnapshotPathForIdentity(
  identity: ProposalPackIdentity,
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env.HIVE_PROPOSAL_PACK_SNAPSHOTS_DIR?.trim();
  const fileName = `${identity.packContentSha256.toLowerCase()}.json`;
  if (override) {
    return join(override, fileName);
  }
  const packId = identity.packId.trim();
  return join(
    hiveMonorepoRoot(),
    "brain",
    "domain-packs",
    packId,
    "snapshots",
    fileName,
  );
}
