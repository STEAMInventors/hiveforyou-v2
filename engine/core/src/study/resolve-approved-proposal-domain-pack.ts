import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import {
  computeProposalPackContentSha256,
  validateProposalDomainPack,
} from "@hiveforyou/domain-pack/pack-driven-reader";

const PROPOSED_V03_MARKERS = ["iep-pack.v0.3.proposed", "v0.3.proposed.json"] as const;

export class PackNotReadyError extends Error {
  readonly code = "PACK_NOT_READY";

  constructor(message = "Approved Domain Pack is not available for deterministic canonical study.") {
    super(message);
    this.name = "PackNotReadyError";
  }
}

type ReviewCheckSidecar = {
  runtimeCompatible?: boolean;
  packStatus?: string;
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
