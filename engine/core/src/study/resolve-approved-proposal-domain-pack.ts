import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import {
  computeProposalPackContentSha256,
  validateProposalDomainPack,
} from "@hiveforyou/domain-pack/pack-driven-reader";

import { packDrivenProposalPackPath } from "./agentic-reader-qualification.js";
import { hiveMonorepoRoot } from "./resolve-hive-monorepo-root.js";

const PROPOSED_V03_MARKERS = ["iep-pack.v0.3.proposed", "v0.3.proposed.json"] as const;

/** Content-addressed Reader proposal pack snapshots (immutable extraction inputs). */
export const PROPOSAL_PACK_SNAPSHOTS_RELATIVE_DIR = join(
  "brain",
  "domain-packs",
  "iep",
  "snapshots",
);

export function proposalPackSnapshotsDir(
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env.HIVE_PROPOSAL_PACK_SNAPSHOTS_DIR?.trim();
  if (override) {
    return override;
  }
  return join(hiveMonorepoRoot(), PROPOSAL_PACK_SNAPSHOTS_RELATIVE_DIR);
}

export function proposalPackSnapshotPathForHash(
  contentSha256: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return join(proposalPackSnapshotsDir(env), `${contentSha256.toLowerCase()}.json`);
}

export function proposalPackSnapshotsDirForPackId(
  packId: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env.HIVE_PROPOSAL_PACK_SNAPSHOTS_DIR?.trim();
  if (override) {
    return override;
  }
  return join(hiveMonorepoRoot(), "brain", "domain-packs", packId.trim(), "snapshots");
}

export function collectProposalPackSnapshotCandidatePaths(input: {
  envelopePackId: string;
  envelopePackVersion: string;
  envelopeHash: string;
  env?: Record<string, string | undefined>;
}): string[] {
  const env = input.env ?? process.env;
  const hash = input.envelopeHash.toLowerCase();
  const paths = new Set<string>();

  paths.add(
    join(proposalPackSnapshotsDirForPackId(input.envelopePackId, env), `${hash}.json`),
  );
  paths.add(proposalPackSnapshotPathForHash(hash, env));

  const snapshotsDir = proposalPackSnapshotsDirForPackId(input.envelopePackId, env);
  if (existsSync(snapshotsDir)) {
    const versionedName = `${input.envelopePackId}@${input.envelopePackVersion}.${hash}.json`;
    paths.add(join(snapshotsDir, versionedName));
    for (const entry of readdirSync(snapshotsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === "manifest.json") {
        continue;
      }
      if (entry.name.toLowerCase().includes(hash)) {
        paths.add(join(snapshotsDir, entry.name));
      }
    }
  }

  return [...paths];
}

/** Inspector-only label: structural pack input, not production approval. */
export const CANONICAL_STUDY_DEBUG_PACK_APPROVAL = "DEBUG_UNAPPROVED_PACK" as const;

export type PackResolutionDiagnostics = {
  envelopePackId: string;
  envelopePackVersion: string;
  envelopePackContentSha256: string;
  candidatePaths: string[];
  onDiskCurrentPackPath: string | null;
  onDiskCurrentPackContentSha256: string | null;
  expectedSnapshotPath: string;
  compatibilityErrors: string[];
};

export class PackNotReadyError extends Error {
  readonly code = "PACK_NOT_READY";

  constructor(message = "Approved Domain Pack is not available for deterministic canonical study.") {
    super(message);
    this.name = "PackNotReadyError";
  }
}

export class PackNotAvailableError extends Error {
  readonly code = "PACK_NOT_AVAILABLE";
  readonly diagnostics: PackResolutionDiagnostics;

  constructor(message: string, diagnostics: PackResolutionDiagnostics) {
    super(message);
    this.name = "PackNotAvailableError";
    this.diagnostics = diagnostics;
  }
}

type ReviewCheckSidecar = {
  runtimeCompatible?: boolean;
  packStatus?: string;
};

export type ResolvedDebugCanonicalStudyDomainPack = {
  pack: ProposalDomainPack;
  path: string;
  contentSha256: string;
  packApprovalLabel: typeof CANONICAL_STUDY_DEBUG_PACK_APPROVAL;
  source: "snapshot" | "override" | "current";
};

function isProposedV03Path(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return PROPOSED_V03_MARKERS.some((marker) => normalized.includes(marker.toLowerCase()));
}

function readReviewCheckSidecar(packPath: string): ReviewCheckSidecar | null {
  const sidecarPath = join(dirname(packPath), "review-check.json");
  try {
    return JSON.parse(readFileSync(sidecarPath, "utf8")) as ReviewCheckSidecar;
  } catch {
    return null;
  }
}

function assertPackRuntimeApproved(pack: ProposalDomainPack, packPath: string): void {
  if (pack.status === "REVIEW_DRAFT_NOT_RUNTIME_COMPATIBLE") {
    throw new PackNotReadyError(
      "Configured Domain Pack is review draft only and is not runtime compatible.",
    );
  }
  const sidecar = readReviewCheckSidecar(packPath);
  if (sidecar?.runtimeCompatible === false) {
    throw new PackNotReadyError("Configured Domain Pack review check marks runtimeCompatible=false.");
  }
  if (sidecar?.packStatus === "REVIEW_DRAFT_NOT_RUNTIME_COMPATIBLE") {
    throw new PackNotReadyError("Configured Domain Pack review check is not runtime compatible.");
  }
}

function collectDebugPackCandidatePaths(input: {
  packId: string;
  packVersion: string;
  envelopeHash: string;
  env: Record<string, string | undefined>;
}): string[] {
  const paths = new Set<string>();
  const override = input.env.HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON?.trim();
  if (override) {
    paths.add(override);
  }
  for (const path of collectProposalPackSnapshotCandidatePaths({
    envelopePackId: input.packId,
    envelopePackVersion: input.packVersion,
    envelopeHash: input.envelopeHash,
    env: input.env,
  })) {
    paths.add(path);
  }
  if (input.packId === "iep" && input.packVersion === "0.3.0-proposed") {
    paths.add(packDrivenProposalPackPath(input.env));
  }
  return [...paths];
}

function readOnDiskCurrentPackHash(
  packId: string,
  packVersion: string,
  env: Record<string, string | undefined>,
): { path: string | null; contentSha256: string | null } {
  if (packId !== "iep" || packVersion !== "0.3.0-proposed") {
    return { path: null, contentSha256: null };
  }
  const path = packDrivenProposalPackPath(env);
  try {
    const pack = JSON.parse(readFileSync(path, "utf8")) as ProposalDomainPack;
    return {
      path,
      contentSha256: computeProposalPackContentSha256(pack).toLowerCase(),
    };
  } catch {
    return { path, contentSha256: null };
  }
}

function tryLoadStrictEnvelopeMatchedPack(input: {
  path: string;
  envelopePackId: string;
  envelopePackVersion: string;
  envelopeHash: string;
  env: Record<string, string | undefined>;
}):
  | { pack: ProposalDomainPack; path: string; contentSha256: string; source: ResolvedDebugCanonicalStudyDomainPack["source"] }
  | null {
  let raw: string;
  try {
    raw = readFileSync(input.path, "utf8");
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno?.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  const pack = JSON.parse(raw) as ProposalDomainPack;
  const validation = validateProposalDomainPack(pack);
  if (!validation.valid) {
    return null;
  }
  if (pack.manifest.id !== input.envelopePackId) {
    return null;
  }
  if (pack.manifest.version !== input.envelopePackVersion) {
    return null;
  }
  const contentSha256 = computeProposalPackContentSha256(pack).toLowerCase();
  if (contentSha256 !== input.envelopeHash) {
    return null;
  }
  const override = input.env.HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON?.trim();
  const defaultCurrentPath = packDrivenProposalPackPath({});
  const source: ResolvedDebugCanonicalStudyDomainPack["source"] =
    override && input.path === override
      ? "override"
      : input.path === proposalPackSnapshotPathForHash(input.envelopeHash, input.env) ||
          input.path.includes(`${input.envelopeHash.toLowerCase()}.json`)
        ? "snapshot"
        : input.path === defaultCurrentPath
          ? "current"
          : "override";
  return { pack, path: input.path, contentSha256, source };
}

function buildCompatibilityErrors(input: {
  envelopePackId: string;
  envelopePackVersion: string;
  envelopeHash: string;
  onDiskCurrentPackPath: string | null;
  onDiskCurrentPackContentSha256: string | null;
  expectedSnapshotPath: string;
}): string[] {
  const errors: string[] = [];
  if (
    input.onDiskCurrentPackPath &&
    input.onDiskCurrentPackContentSha256 &&
    input.onDiskCurrentPackContentSha256 !== input.envelopeHash
  ) {
    errors.push(
      `Current on-disk pack at ${input.onDiskCurrentPackPath} has hash ${input.onDiskCurrentPackContentSha256}, which does not match the Reader envelope hash ${input.envelopeHash}.`,
    );
  }
  errors.push(`Missing historical Reader pack snapshot at ${input.expectedSnapshotPath}.`);
  return errors;
}

/**
 * Loads the Domain Pack referenced by persisted Reader envelopes for the temporary
 * Canonical Study Inspector. Structural input only — not production approval.
 */
export function resolveDebugCanonicalStudyDomainPack(input: {
  envelopePackId: string;
  envelopePackVersion: string;
  envelopePackContentSha256: string | null;
  env?: Record<string, string | undefined>;
}): ResolvedDebugCanonicalStudyDomainPack {
  const env = input.env ?? process.env;
  const envelopeHash = input.envelopePackContentSha256?.trim().toLowerCase();
  if (!envelopeHash) {
    throw new PackNotAvailableError("Reader extraction Domain Pack content hash is missing.", {
      envelopePackId: input.envelopePackId,
      envelopePackVersion: input.envelopePackVersion,
      envelopePackContentSha256: "",
      candidatePaths: [],
      onDiskCurrentPackPath: null,
      onDiskCurrentPackContentSha256: null,
      expectedSnapshotPath: proposalPackSnapshotPathForHash("", env),
      compatibilityErrors: ["Reader extraction Domain Pack content hash is missing."],
    });
  }

  const onDiskCurrent = readOnDiskCurrentPackHash(
    input.envelopePackId,
    input.envelopePackVersion,
    env,
  );
  const expectedSnapshotPath = proposalPackSnapshotPathForHash(envelopeHash, env);
  const candidatePaths = collectDebugPackCandidatePaths({
    packId: input.envelopePackId,
    packVersion: input.envelopePackVersion,
    envelopeHash,
    env,
  });

  if (candidatePaths.length === 0) {
    const diagnostics: PackResolutionDiagnostics = {
      envelopePackId: input.envelopePackId,
      envelopePackVersion: input.envelopePackVersion,
      envelopePackContentSha256: envelopeHash,
      candidatePaths,
      onDiskCurrentPackPath: onDiskCurrent.path,
      onDiskCurrentPackContentSha256: onDiskCurrent.contentSha256,
      expectedSnapshotPath,
      compatibilityErrors: [
        `No Domain Pack candidate paths are configured for ${input.envelopePackId}@${input.envelopePackVersion}.`,
      ],
    };
    throw new PackNotAvailableError(
      `No Domain Pack is available for ${input.envelopePackId}@${input.envelopePackVersion}.`,
      diagnostics,
    );
  }

  for (const path of candidatePaths) {
    const loaded = tryLoadStrictEnvelopeMatchedPack({
      path,
      envelopePackId: input.envelopePackId,
      envelopePackVersion: input.envelopePackVersion,
      envelopeHash,
      env,
    });
    if (loaded) {
      return {
        pack: loaded.pack,
        path: loaded.path,
        contentSha256: loaded.contentSha256,
        packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
        source: loaded.source,
      };
    }
  }

  const diagnostics: PackResolutionDiagnostics = {
    envelopePackId: input.envelopePackId,
    envelopePackVersion: input.envelopePackVersion,
    envelopePackContentSha256: envelopeHash,
    candidatePaths,
    onDiskCurrentPackPath: onDiskCurrent.path,
    onDiskCurrentPackContentSha256: onDiskCurrent.contentSha256,
    expectedSnapshotPath,
    compatibilityErrors: buildCompatibilityErrors({
      envelopePackId: input.envelopePackId,
      envelopePackVersion: input.envelopePackVersion,
      envelopeHash,
      onDiskCurrentPackPath: onDiskCurrent.path,
      onDiskCurrentPackContentSha256: onDiskCurrent.contentSha256,
      expectedSnapshotPath,
    }),
  };

  throw new PackNotAvailableError(
    `Matching Domain Pack is unavailable for ${input.envelopePackId}@${input.envelopePackVersion} (hash ${envelopeHash}).`,
    diagnostics,
  );
}

/**
 * Loads an explicitly approved proposal Domain Pack for deterministic canonical study.
 * Never falls back to the pack-driven Reader default (proposed v0.3).
 */
export function resolveApprovedProposalDomainPack(
  env: Record<string, string | undefined> = process.env,
): { pack: ProposalDomainPack; path: string; contentSha256: string } {
  const configuredPath = env.HIVE_CANONICAL_STUDY_APPROVED_PACK_JSON?.trim();
  if (!configuredPath) {
    throw new PackNotReadyError(
      "Set HIVE_CANONICAL_STUDY_APPROVED_PACK_JSON to an approved, runtime-compatible Domain Pack JSON file.",
    );
  }

  if (isProposedV03Path(configuredPath)) {
    throw new PackNotReadyError("Proposed v0.3 Domain Pack is not approved for canonical study.");
  }

  let raw: string;
  try {
    raw = readFileSync(configuredPath, "utf8");
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno?.code === "ENOENT") {
      throw new PackNotReadyError(`Approved Domain Pack file was not found: ${configuredPath}`);
    }
    throw error;
  }

  const pack = JSON.parse(raw) as ProposalDomainPack;
  const validation = validateProposalDomainPack(pack);
  if (!validation.valid) {
    throw new PackNotReadyError("Approved Domain Pack failed structural validation.");
  }

  assertPackRuntimeApproved(pack, configuredPath);

  return {
    pack,
    path: configuredPath,
    contentSha256: computeProposalPackContentSha256(pack).toLowerCase(),
  };
}

export function assertEnvelopePackMatchesApprovedPack(input: {
  envelopePackId: string;
  envelopePackVersion: string;
  envelopePackContentSha256: string | null;
  approved: { pack: ProposalDomainPack; contentSha256: string };
}): void {
  if (input.approved.pack.manifest.id !== input.envelopePackId) {
    throw new PackNotReadyError("Reader extraction Domain Pack id does not match the approved pack.");
  }
  if (input.approved.pack.manifest.version !== input.envelopePackVersion) {
    throw new PackNotReadyError(
      "Reader extraction Domain Pack version does not match the approved pack.",
    );
  }
  const envelopeHash = input.envelopePackContentSha256?.trim().toLowerCase();
  if (!envelopeHash || envelopeHash !== input.approved.contentSha256) {
    throw new PackNotReadyError(
      "Reader extraction Domain Pack content hash does not match the approved pack.",
    );
  }
}
