import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import {
  computeProposalPackContentSha256,
  validateProposalDomainPack,
} from "@hiveforyou/domain-pack/pack-driven-reader";

import { packDrivenProposalPackPath } from "./agentic-reader-qualification.js";

const PROPOSED_V03_MARKERS = ["iep-pack.v0.3.proposed", "v0.3.proposed.json"] as const;

/** Inspector-only label: structural pack input, not production approval. */
export const CANONICAL_STUDY_DEBUG_PACK_APPROVAL = "DEBUG_UNAPPROVED_PACK" as const;

export class PackNotReadyError extends Error {
  readonly code = "PACK_NOT_READY";

  constructor(message = "Approved Domain Pack is not available for deterministic canonical study.") {
    super(message);
    this.name = "PackNotReadyError";
  }
}

export class PackNotAvailableError extends Error {
  readonly code = "PACK_NOT_AVAILABLE";

  constructor(message = "Matching Domain Pack is not available for canonical study debug.") {
    super(message);
    this.name = "PackNotAvailableError";
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
  env: Record<string, string | undefined>;
}): string[] {
  const paths = new Set<string>();
  const override = input.env.HIVE_PACK_DRIVEN_READER_PROPOSAL_JSON?.trim();
  if (override) {
    paths.add(override);
  }
  if (input.packId === "iep" && input.packVersion === "0.3.0-proposed") {
    paths.add(packDrivenProposalPackPath(input.env));
  }
  return [...paths];
}

function tryLoadStrictEnvelopeMatchedPack(input: {
  path: string;
  envelopePackId: string;
  envelopePackVersion: string;
  envelopeHash: string;
}):
  | { pack: ProposalDomainPack; path: string; contentSha256: string }
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
  return { pack, path: input.path, contentSha256 };
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
    throw new PackNotAvailableError("Reader extraction Domain Pack content hash is missing.");
  }

  const candidatePaths = collectDebugPackCandidatePaths({
    packId: input.envelopePackId,
    packVersion: input.envelopePackVersion,
    env,
  });
  if (candidatePaths.length === 0) {
    throw new PackNotAvailableError(
      `No Domain Pack is available for ${input.envelopePackId}@${input.envelopePackVersion}.`,
    );
  }

  for (const path of candidatePaths) {
    const loaded = tryLoadStrictEnvelopeMatchedPack({
      path,
      envelopePackId: input.envelopePackId,
      envelopePackVersion: input.envelopePackVersion,
      envelopeHash,
    });
    if (loaded) {
      return {
        ...loaded,
        packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
      };
    }
  }

  throw new PackNotAvailableError(
    `Matching Domain Pack is unavailable for ${input.envelopePackId}@${input.envelopePackVersion} (hash ${envelopeHash}).`,
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
