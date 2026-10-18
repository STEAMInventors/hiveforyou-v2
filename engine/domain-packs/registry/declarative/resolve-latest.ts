import { join } from "node:path";

import { validateProposalDomainPack } from "@hiveforyou/domain-pack/pack-driven-reader";

import { compileDeclarativePackToProposal } from "./compile-to-proposal.js";
import { computeDeclarativePackContentDigest } from "./digest.js";
import { loadDeclarativePackFromRoot } from "./load-raw-pack.js";
import { defaultDeclarativePackRepoRoot } from "./repo-root.js";
import { listDeclarativePackRegistrations } from "./register.js";
import { compareSemver, isPrerelease, normalizePackVersionLabel } from "./semver.js";
import {
  validateDeclarativePackFilesExist,
  validateDeclarativePackStructure,
} from "./validate-declarative-pack.js";
import type { ResolvedDeclarativePack } from "./types.js";

export class DeclarativePackResolutionError extends Error {
  readonly code = "DECLARATIVE_PACK_UNAVAILABLE" as const;

  constructor(message: string) {
    super(message);
    this.name = "DeclarativePackResolutionError";
  }
}

export type ResolveLatestDeclarativePackOptions = {
  domainId: string;
  repoRoot: string;
  allowPrerelease?: boolean;
};

export type ResolvedDeclarativePackSelection = ResolvedDeclarativePack & {
  compiledProposalPack: ReturnType<typeof compileDeclarativePackToProposal>;
};

function repoRootFromEnv(env: Record<string, string | undefined> = process.env): string {
  const override = env.HIVE_MONOREPO_ROOT?.trim();
  if (override) {
    return override;
  }
  return defaultDeclarativePackRepoRoot();
}

export function resolveLatestEligibleDeclarativePack(
  input: ResolveLatestDeclarativePackOptions,
): ResolvedDeclarativePackSelection {
  const domainId = input.domainId.trim();
  if (!domainId) {
    throw new DeclarativePackResolutionError("domainId is required");
  }

  const candidates = listDeclarativePackRegistrations(domainId).filter((entry) => entry.eligible);
  if (candidates.length === 0) {
    throw new DeclarativePackResolutionError(`No registered declarative packs for domain ${domainId}`);
  }

  const allowPrerelease = input.allowPrerelease === true;
  const resolved: Array<{
    registration: (typeof candidates)[0];
    semver: NonNullable<ReturnType<typeof normalizePackVersionLabel>>;
    packRoot: string;
    raw: ReturnType<typeof loadDeclarativePackFromRoot>;
    digest: string;
  }> = [];

  for (const registration of candidates) {
    const packRoot = join(input.repoRoot, registration.packRootRelative);
    const raw = loadDeclarativePackFromRoot(packRoot);
    const fileErrors = validateDeclarativePackFilesExist(packRoot, raw.manifest);
    if (fileErrors.length > 0) {
      continue;
    }
    const structure = validateDeclarativePackStructure(raw);
    if (!structure.valid) {
      continue;
    }
    const semver = normalizePackVersionLabel(raw.manifest.packVersion);
    if (!semver) {
      continue;
    }
    if (isPrerelease(semver) && !allowPrerelease) {
      continue;
    }
    resolved.push({
      registration,
      semver,
      packRoot,
      raw,
      digest: computeDeclarativePackContentDigest({ packRoot, manifest: raw.manifest }),
    });
  }

  if (resolved.length === 0) {
    throw new DeclarativePackResolutionError(
      `No valid compatible declarative pack versions for domain ${domainId}`,
    );
  }

  resolved.sort((a, b) => compareSemver(b.semver, a.semver));
  const winner = resolved[0]!;
  const compiledProposalPack = compileDeclarativePackToProposal(winner.raw);
  const proposalValidation = validateProposalDomainPack(compiledProposalPack);
  if (!proposalValidation.valid) {
    throw new DeclarativePackResolutionError(
      `Compiled declarative pack failed proposal validation: ${proposalValidation.errors.slice(0, 3).join("; ")}`,
    );
  }

  return {
    domainId,
    domainPackId: winner.raw.manifest.id,
    semanticVersion: `${winner.semver.major}.${winner.semver.minor}.${winner.semver.patch}`,
    packVersionLabel: winner.raw.manifest.packVersion,
    packContractVersion: winner.raw.manifest.contractVersion,
    contentDigest: winner.digest,
    packRoot: winner.packRoot,
    raw: winner.raw,
    compiledProposalPack,
  };
}

export function resolveLatestEligibleDeclarativePackFromEnv(
  domainId: string,
  env: Record<string, string | undefined> = process.env,
): ResolvedDeclarativePackSelection {
  return resolveLatestEligibleDeclarativePack({
    domainId,
    repoRoot: repoRootFromEnv(env),
    allowPrerelease: env.HIVE_DECLARATIVE_PACK_ALLOW_PRERELEASE === "1",
  });
}

export function resolveDeclarativePackByContentDigest(input: {
  domainId: string;
  contentDigest: string;
  repoRoot: string;
  allowPrerelease?: boolean;
}): ResolvedDeclarativePackSelection | null {
  const digest = input.contentDigest.trim().toLowerCase();
  for (const registration of listDeclarativePackRegistrations(input.domainId.trim())) {
    if (!registration.eligible) continue;
    const packRoot = join(input.repoRoot, registration.packRootRelative);
    try {
      const raw = loadDeclarativePackFromRoot(packRoot);
      const computed = computeDeclarativePackContentDigest({ packRoot, manifest: raw.manifest });
      if (computed !== digest) continue;
      const semver = normalizePackVersionLabel(raw.manifest.packVersion);
      if (!semver) continue;
      if (isPrerelease(semver) && input.allowPrerelease !== true) continue;
      const compiledProposalPack = compileDeclarativePackToProposal(raw);
      const proposalValidation = validateProposalDomainPack(compiledProposalPack);
      if (!proposalValidation.valid) continue;
      return {
        domainId: input.domainId.trim(),
        domainPackId: raw.manifest.id,
        semanticVersion: `${semver.major}.${semver.minor}.${semver.patch}`,
        packVersionLabel: raw.manifest.packVersion,
        packContractVersion: raw.manifest.contractVersion,
        contentDigest: computed,
        packRoot,
        raw,
        compiledProposalPack,
      };
    } catch {
      continue;
    }
  }
  return null;
}
