import {
  DeclarativePackResolutionError,
  defaultDeclarativePackRepoRoot,
  resolveDeclarativePackByContentDigest,
  resolveLatestEligibleDeclarativePackFromEnv,
  type ResolvedDeclarativePackSelection,
} from "@hiveforyou/domain-packs";

import { isDeclarativeStudyPackResolverEnabled } from "./declarative-pack-activation.js";

export type StudyDeclarativePackBinding = {
  domainPackId: string;
  domainPackVersion: string;
  packContractVersion: string;
  contentDigest: string;
  packVersionLabel: string;
};

export class StudyDeclarativePackBindingError extends Error {
  readonly code = "STUDY_DECLARATIVE_PACK_BINDING_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "StudyDeclarativePackBindingError";
  }
}

export function resolveStudyDeclarativePackBinding(input: {
  domainId: string;
  existingBinding?: StudyDeclarativePackBinding | null;
  env?: Record<string, string | undefined>;
}): {
  binding: StudyDeclarativePackBinding;
  selection: ResolvedDeclarativePackSelection;
} {
  if (!isDeclarativeStudyPackResolverEnabled(input.env)) {
    throw new StudyDeclarativePackBindingError(
      "Declarative study pack resolver is not enabled for this deployment.",
    );
  }

  const env = input.env ?? process.env;
  const existing = input.existingBinding;
  const allowPrerelease = env.HIVE_DECLARATIVE_PACK_ALLOW_PRERELEASE === "1";
  const repoRoot = env.HIVE_MONOREPO_ROOT?.trim() || defaultDeclarativePackRepoRoot();

  let selection: ResolvedDeclarativePackSelection;
  if (existing) {
    const pinned = resolveDeclarativePackByContentDigest({
      domainId: input.domainId.trim(),
      contentDigest: existing.contentDigest,
      repoRoot,
      allowPrerelease,
    });
    if (!pinned) {
      throw new StudyDeclarativePackBindingError(
        "Pinned declarative pack digest is no longer available in the registry.",
      );
    }
    selection = pinned;
    return { binding: existing, selection };
  }

  try {
    selection = resolveLatestEligibleDeclarativePackFromEnv(input.domainId.trim(), env);
  } catch (error) {
    if (error instanceof DeclarativePackResolutionError) {
      throw new StudyDeclarativePackBindingError(error.message);
    }
    throw error;
  }

  const binding: StudyDeclarativePackBinding = {
    domainPackId: selection.domainPackId,
    domainPackVersion: selection.semanticVersion,
    packContractVersion: selection.packContractVersion,
    contentDigest: selection.contentDigest,
    packVersionLabel: selection.packVersionLabel,
  };

  return { binding, selection };
}
