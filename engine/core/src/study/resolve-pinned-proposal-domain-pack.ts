import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import {
  computeProposalPackContentSha256,
  validateProposalDomainPack,
} from "@hiveforyou/domain-pack/pack-driven-reader";
import {
  defaultDeclarativePackRepoRoot,
  resolveDeclarativePackByContentDigest,
} from "@hiveforyou/domain-packs";
import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";

import {
  CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
  PackNotAvailableError,
  resolveDebugCanonicalStudyDomainPack,
  type ResolvedDebugCanonicalStudyDomainPack,
} from "./resolve-approved-proposal-domain-pack.js";
import {
  proposalPackSnapshotPathForIdentity,
  resolveStudyReaderProposalPackBinding,
  type ProposalPackIdentity,
} from "./resolve-proposal-pack-identity.js";

export class PinnedProposalDomainPackError extends Error {
  readonly code = "PINNED_PROPOSAL_DOMAIN_PACK_UNAVAILABLE" as const;

  constructor(message: string) {
    super(message);
    this.name = "PinnedProposalDomainPackError";
  }
}

export type ResolvedPinnedProposalDomainPack = {
  pack: ProposalDomainPack;
  path: string;
  contentSha256: string;
  source: "declarative-compiled" | "legacy-snapshot";
  identity: ProposalPackIdentity;
};

function repoRootFromEnv(env: Record<string, string | undefined>): string {
  return env.HIVE_MONOREPO_ROOT?.trim() || defaultDeclarativePackRepoRoot();
}

function materializeProposalSnapshotIfMissing(
  pack: ProposalDomainPack,
  identity: ProposalPackIdentity,
  env: Record<string, string | undefined>,
): string {
  const snapshotPath = proposalPackSnapshotPathForIdentity(identity, env);
  if (!existsSync(snapshotPath)) {
    mkdirSync(dirname(snapshotPath), { recursive: true });
    writeFileSync(snapshotPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
  }
  return snapshotPath;
}

function loadStrictProposalPackFromPath(
  path: string,
  identity: ProposalPackIdentity,
): ProposalDomainPack {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno?.code === "ENOENT") {
      throw new PinnedProposalDomainPackError(`Proposal Domain Pack snapshot is missing at ${path}.`);
    }
    throw error;
  }

  const pack = JSON.parse(raw) as ProposalDomainPack;
  const validation = validateProposalDomainPack(pack);
  if (!validation.valid) {
    throw new PinnedProposalDomainPackError(
      "Pinned proposal Domain Pack failed structural validation.",
    );
  }
  if (pack.manifest.id !== identity.packId) {
    throw new PinnedProposalDomainPackError(
      `Pinned pack manifest id ${pack.manifest.id} does not match expected ${identity.packId}.`,
    );
  }
  if (pack.manifest.version !== identity.packVersion) {
    throw new PinnedProposalDomainPackError(
      `Pinned pack manifest version ${pack.manifest.version} does not match expected ${identity.packVersion}.`,
    );
  }
  const contentSha256 = computeProposalPackContentSha256(pack).toLowerCase();
  if (contentSha256 !== identity.packContentSha256) {
    throw new PinnedProposalDomainPackError(
      `Pinned pack content hash ${contentSha256} does not match expected ${identity.packContentSha256}.`,
    );
  }
  return pack;
}

function resolveFromDeclarativeBinding(input: {
  context: Pick<CanonicalStudyContext, "domainId" | "processingPolicy">;
  env: Record<string, string | undefined>;
}): ResolvedPinnedProposalDomainPack {
  const binding = input.context.processingPolicy.declarativePackBinding;
  if (!binding?.contentDigest?.trim()) {
    throw new PinnedProposalDomainPackError(
      "Declarative pack binding is missing contentDigest.",
    );
  }

  const allowPrerelease = input.env.HIVE_DECLARATIVE_PACK_ALLOW_PRERELEASE === "1";
  const pinned = resolveDeclarativePackByContentDigest({
    domainId: input.context.domainId.trim(),
    contentDigest: binding.contentDigest.trim(),
    repoRoot: repoRootFromEnv(input.env),
    allowPrerelease,
  });
  if (!pinned) {
    throw new PinnedProposalDomainPackError(
      "Pinned declarative pack digest is no longer available in the registry.",
    );
  }

  const validation = validateProposalDomainPack(pinned.compiledProposalPack);
  if (!validation.valid) {
    throw new PinnedProposalDomainPackError(
      "Compiled declarative Domain Pack failed proposal schema validation.",
    );
  }

  const contentSha256 = computeProposalPackContentSha256(pinned.compiledProposalPack).toLowerCase();
  const identity: ProposalPackIdentity = {
    packId: pinned.compiledProposalPack.manifest.id,
    packVersion: pinned.compiledProposalPack.manifest.version,
    packContentSha256: contentSha256,
  };

  const path = materializeProposalSnapshotIfMissing(
    pinned.compiledProposalPack,
    identity,
    input.env,
  );

  return {
    pack: pinned.compiledProposalPack,
    path,
    contentSha256,
    source: "declarative-compiled",
    identity,
  };
}

function resolveFromLegacySnapshot(input: {
  context: Pick<CanonicalStudyContext, "domainId" | "processingPolicy">;
  env: Record<string, string | undefined>;
}): ResolvedPinnedProposalDomainPack {
  const identity = resolveStudyReaderProposalPackBinding({
    domainId: input.context.domainId,
    proposalPackContentSha256: input.context.processingPolicy.proposalPackContentSha256,
    env: input.env,
  });
  const path = proposalPackSnapshotPathForIdentity(identity, input.env);
  const pack = loadStrictProposalPackFromPath(path, identity);
  return {
    pack,
    path,
    contentSha256: identity.packContentSha256,
    source: "legacy-snapshot",
    identity,
  };
}

/**
 * Resolves the exact proposal Domain Pack for a study run.
 * Declarative-bound runs pin by persisted contentDigest (never "latest").
 */
export function resolvePinnedProposalDomainPackFromStudyContext(input: {
  context: Pick<CanonicalStudyContext, "domainId" | "processingPolicy">;
  env?: Record<string, string | undefined>;
}): ResolvedPinnedProposalDomainPack {
  const env = input.env ?? process.env;
  if (input.context.processingPolicy.declarativePackBinding) {
    return resolveFromDeclarativeBinding({ context: input.context, env });
  }
  return resolveFromLegacySnapshot({ context: input.context, env });
}

export function resolveStudyReaderProposalPackBindingFromContext(input: {
  context: Pick<CanonicalStudyContext, "domainId" | "processingPolicy">;
  env?: Record<string, string | undefined>;
}): ProposalPackIdentity {
  return resolvePinnedProposalDomainPackFromStudyContext(input).identity;
}

export function resolveStructuralPackForCanonicalStudy(input: {
  context: Pick<CanonicalStudyContext, "domainId" | "processingPolicy"> | null | undefined;
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
      expectedSnapshotPath: join("brain", "domain-packs", input.envelopePackId, "snapshots"),
      compatibilityErrors: ["Reader extraction Domain Pack content hash is missing."],
    });
  }

  if (input.context?.processingPolicy.declarativePackBinding) {
    const pinned = resolvePinnedProposalDomainPackFromStudyContext({
      context: input.context,
      env,
    });
    if (
      pinned.identity.packId !== input.envelopePackId.trim() ||
      pinned.identity.packVersion !== input.envelopePackVersion.trim() ||
      pinned.contentSha256 !== envelopeHash
    ) {
      throw new PackNotAvailableError(
        "Reader envelope pack identity does not match the study's pinned declarative pack.",
        {
          envelopePackId: input.envelopePackId,
          envelopePackVersion: input.envelopePackVersion,
          envelopePackContentSha256: envelopeHash,
          candidatePaths: [pinned.path],
          onDiskCurrentPackPath: pinned.path,
          onDiskCurrentPackContentSha256: pinned.contentSha256,
          expectedSnapshotPath: pinned.path,
          compatibilityErrors: [
            `Expected pinned pack ${pinned.identity.packId}@${pinned.identity.packVersion} (${pinned.contentSha256}).`,
          ],
        },
      );
    }
    return {
      pack: pinned.pack,
      path: pinned.path,
      contentSha256: pinned.contentSha256,
      packApprovalLabel: CANONICAL_STUDY_DEBUG_PACK_APPROVAL,
      source: "snapshot",
    };
  }

  return resolveDebugCanonicalStudyDomainPack({
    envelopePackId: input.envelopePackId,
    envelopePackVersion: input.envelopePackVersion,
    envelopePackContentSha256: envelopeHash,
    env,
  });
}
