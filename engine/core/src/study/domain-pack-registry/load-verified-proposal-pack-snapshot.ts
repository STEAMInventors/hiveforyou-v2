import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import {
  computeProposalPackContentSha256,
  validateProposalDomainPack,
} from "@hiveforyou/domain-pack/pack-driven-reader";
import type { DomainPackRegistryEntry } from "@hiveforyou/shared/domain-pack-registry";

import { hiveMonorepoRoot } from "../resolve-hive-monorepo-root.js";
import { proposalPackSnapshotPathForIdentity } from "../resolve-proposal-pack-identity.js";
import { DomainPackRegistryError } from "./errors.js";

const BRAIN_SNAPSHOT_BUCKET = "brain" as const;

export function resolveRegistrySnapshotFilesystemPath(
  entry: DomainPackRegistryEntry,
  env: Record<string, string | undefined> = process.env,
): string {
  if (entry.snapshotStorageBucket === BRAIN_SNAPSHOT_BUCKET) {
    return join(hiveMonorepoRoot(), entry.snapshotStoragePath);
  }
  if (entry.snapshotStorageBucket === "domain-pack-snapshots") {
    const brainRoot = env.HIVE_DOMAIN_PACKS_BRAIN_DIR?.trim();
    const base = brainRoot
      ? join(brainRoot, "..", "..")
      : hiveMonorepoRoot();
    return join(base, "brain", "domain-packs", entry.snapshotStoragePath.replace(/^iep\//, "iep/snapshots/"));
  }
  throw new DomainPackRegistryError(
    "DOMAIN_PACK_REGISTRY_SNAPSHOT_BUCKET_UNSUPPORTED",
    `Unsupported snapshot storage bucket: ${entry.snapshotStorageBucket}`,
  );
}

function decodeSnapshotBytes(bytes: Uint8Array | string): string {
  return typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("utf8");
}

async function readRegistrySnapshotRaw(input: {
  entry: DomainPackRegistryEntry;
  env: Record<string, string | undefined>;
  readSnapshotBytes?: (
    entry: DomainPackRegistryEntry,
  ) => Promise<Uint8Array | string>;
}): Promise<{ raw: string; snapshotPath: string }> {
  const expected = input.entry.contentSha256.toLowerCase();
  if (input.readSnapshotBytes) {
    try {
      const bytes = await input.readSnapshotBytes(input.entry);
      return {
        raw: decodeSnapshotBytes(bytes),
        snapshotPath: `${input.entry.snapshotStorageBucket}/${input.entry.snapshotStoragePath}`,
      };
    } catch (error) {
      if (error instanceof DomainPackRegistryError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : "Snapshot read failed.";
      throw new DomainPackRegistryError("DOMAIN_PACK_REGISTRY_SNAPSHOT_MISSING", message);
    }
  }

  let snapshotPath = resolveRegistrySnapshotFilesystemPath(input.entry, input.env);
  let raw: string;
  try {
    raw = readFileSync(snapshotPath, "utf8");
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno?.code === "ENOENT") {
      snapshotPath = proposalPackSnapshotPathForIdentity(
        {
          packId: input.entry.packId,
          packVersion: input.entry.packVersion,
          packContentSha256: expected,
        },
        input.env,
      );
      try {
        raw = readFileSync(snapshotPath, "utf8");
      } catch (inner) {
        const innerErrno = inner as NodeJS.ErrnoException;
        if (innerErrno?.code === "ENOENT") {
          throw new DomainPackRegistryError(
            "DOMAIN_PACK_REGISTRY_SNAPSHOT_MISSING",
            `Registry snapshot file is missing for digest ${expected}.`,
          );
        }
        throw inner;
      }
    } else {
      throw error;
    }
  }
  return { raw, snapshotPath };
}

export async function loadVerifiedProposalPackSnapshotForRegistryEntry(input: {
  entry: DomainPackRegistryEntry;
  env?: Record<string, string | undefined>;
  readSnapshotBytes?: (
    entry: DomainPackRegistryEntry,
  ) => Promise<Uint8Array | string>;
}): Promise<{ pack: ProposalDomainPack; contentSha256: string; snapshotPath: string }> {
  const env = input.env ?? process.env;
  const expected = input.entry.contentSha256.toLowerCase();
  const { raw, snapshotPath } = await readRegistrySnapshotRaw({
    entry: input.entry,
    env,
    readSnapshotBytes: input.readSnapshotBytes,
  });

  let parsed: ProposalDomainPack;
  try {
    parsed = JSON.parse(raw) as ProposalDomainPack;
  } catch {
    throw new DomainPackRegistryError(
      "DOMAIN_PACK_REGISTRY_SNAPSHOT_CORRUPT",
      `Registry snapshot is not valid JSON: ${snapshotPath}`,
    );
  }
  const validation = validateProposalDomainPack(parsed);
  if (!validation.valid) {
    throw new DomainPackRegistryError(
      "DOMAIN_PACK_REGISTRY_SNAPSHOT_INVALID",
      `Registry snapshot failed structural validation: ${snapshotPath}`,
    );
  }
  const contentSha256 = computeProposalPackContentSha256(parsed).toLowerCase();
  if (contentSha256 !== expected) {
    throw new DomainPackRegistryError(
      "DOMAIN_PACK_REGISTRY_DIGEST_MISMATCH",
      `Registry snapshot digest mismatch for ${expected} (computed ${contentSha256}).`,
    );
  }
  return { pack: parsed, contentSha256, snapshotPath };
}

/** @deprecated Prefer the async loader; sync filesystem-only reads remain for qualification fixtures. */
export function loadVerifiedProposalPackSnapshotForRegistryEntrySync(input: {
  entry: DomainPackRegistryEntry;
  env?: Record<string, string | undefined>;
}): { pack: ProposalDomainPack; contentSha256: string; snapshotPath: string } {
  const env = input.env ?? process.env;
  const expected = input.entry.contentSha256.toLowerCase();
  let snapshotPath = resolveRegistrySnapshotFilesystemPath(input.entry, env);
  let raw: string;
  try {
    raw = readFileSync(snapshotPath, "utf8");
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno?.code === "ENOENT") {
      snapshotPath = proposalPackSnapshotPathForIdentity(
        {
          packId: input.entry.packId,
          packVersion: input.entry.packVersion,
          packContentSha256: expected,
        },
        env,
      );
      raw = readFileSync(snapshotPath, "utf8");
    } else {
      throw error;
    }
  }
  const parsed = JSON.parse(raw) as ProposalDomainPack;
  const validation = validateProposalDomainPack(parsed);
  if (!validation.valid) {
    throw new DomainPackRegistryError(
      "DOMAIN_PACK_REGISTRY_SNAPSHOT_INVALID",
      `Registry snapshot failed structural validation: ${snapshotPath}`,
    );
  }
  const contentSha256 = computeProposalPackContentSha256(parsed).toLowerCase();
  if (contentSha256 !== expected) {
    throw new DomainPackRegistryError(
      "DOMAIN_PACK_REGISTRY_DIGEST_MISMATCH",
      `Registry snapshot digest mismatch for ${expected} (computed ${contentSha256}).`,
    );
  }
  return { pack: parsed, contentSha256, snapshotPath };
}
