import { join } from "node:path";

import { loadDeclarativePackFromRoot } from "../declarative/load-raw-pack.js";
import { compareSemver, isPrerelease, normalizePackVersionLabel } from "../declarative/semver.js";
import {
  validateDeclarativePackFilesExist,
  validateDeclarativePackStructure,
} from "../declarative/validate-declarative-pack.js";
import { adaptDeclarativeToMappingPack } from "./adapt-declarative.js";
import { computeMappingPackContentDigest } from "./digest.js";
import { computeDeclarativePackContentDigest } from "../declarative/digest.js";
import { loadNativeMappingPackFromRoot } from "./load-native.js";
import { genericFallbackRegistration, listMappingPackRegistrations } from "./register.js";
import { mappingPackToDeclarativeRaw } from "./to-declarative-raw.js";
import type { MappingPackPin, MappingPackRegistration, ResolvedMappingPack } from "./types.js";
import { MAPPING_PACK_CONTRACT_VERSION } from "./types.js";
import { validateMappingPackFilesExist, validateMappingPackStructure } from "./validate.js";

export class MappingPackResolutionError extends Error {
  readonly code:
    | "MAPPING_PACK_UNAVAILABLE"
    | "MAPPING_PACK_INVALID"
    | "MAPPING_PACK_PIN_MISMATCH"
    | "MAPPING_PACK_NOT_FOUND";

  constructor(
    code: MappingPackResolutionError["code"],
    message: string,
  ) {
    super(message);
    this.name = "MappingPackResolutionError";
    this.code = code;
  }
}

export type DomainResolutionState = "known" | "unknown" | "unresolved";

export type ResolveMappingPackForDomainOptions = {
  domainId?: string | null;
  domainResolution?: DomainResolutionState;
  repoRoot: string;
  allowPrerelease?: boolean;
  /** Override registrations (tests only). */
  registrations?: MappingPackRegistration[];
};

export type ResolvePinnedMappingPackOptions = {
  pin: Pick<MappingPackPin, "packId" | "packVersion" | "contentDigest">;
  repoRoot: string;
  registrations?: MappingPackRegistration[];
};

type LoadedCandidate = {
  registration: MappingPackRegistration;
  packRoot: string;
  canonical: ReturnType<typeof adaptDeclarativeToMappingPack>;
  declarativeRaw?: ReturnType<typeof loadDeclarativePackFromRoot>;
  digest: string;
  semver: NonNullable<ReturnType<typeof normalizePackVersionLabel>>;
};

function loadRegistrationCandidate(
  registration: MappingPackRegistration,
  repoRoot: string,
  allowPrerelease: boolean,
): LoadedCandidate | { invalid: true; errors: string[] } {
  const packRoot = join(repoRoot, registration.packRootRelative);

  if (registration.source === "native") {
    let canonical;
    try {
      canonical = loadNativeMappingPackFromRoot(packRoot);
    } catch (error) {
      return {
        invalid: true,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
    const fileErrors = validateMappingPackFilesExist(packRoot, canonical.manifest);
    if (fileErrors.length > 0) {
      return { invalid: true, errors: fileErrors };
    }
    const structure = validateMappingPackStructure(canonical);
    if (!structure.valid) {
      return { invalid: true, errors: structure.errors };
    }
    const semver = normalizePackVersionLabel(canonical.manifest.packVersion);
    if (!semver) {
      return { invalid: true, errors: ["invalid packVersion semver"] };
    }
    if (isPrerelease(semver) && !allowPrerelease) {
      return { invalid: true, errors: ["prerelease packVersion not allowed"] };
    }
    return {
      registration,
      packRoot,
      canonical,
      digest: computeMappingPackContentDigest({ packRoot, manifest: canonical.manifest }),
      semver,
    };
  }

  const raw = loadDeclarativePackFromRoot(packRoot);
  const fileErrors = validateDeclarativePackFilesExist(packRoot, raw.manifest);
  if (fileErrors.length > 0) {
    return { invalid: true, errors: fileErrors };
  }
  const structure = validateDeclarativePackStructure(raw);
  if (!structure.valid) {
    return { invalid: true, errors: structure.errors };
  }
  const semver = normalizePackVersionLabel(raw.manifest.packVersion);
  if (!semver) {
    return { invalid: true, errors: ["invalid packVersion semver"] };
  }
  if (isPrerelease(semver) && !allowPrerelease) {
    return { invalid: true, errors: ["prerelease packVersion not allowed"] };
  }
  const canonical = adaptDeclarativeToMappingPack(raw);
  const digest = computeDeclarativePackContentDigest({ packRoot, manifest: raw.manifest });
  return {
    registration,
    packRoot,
    canonical,
    declarativeRaw: raw,
    digest,
    semver,
  };
}

function buildResolved(
  candidate: LoadedCandidate,
  selection: MappingPackPin["selection"],
): ResolvedMappingPack {
  const pin: MappingPackPin = {
    packId: candidate.canonical.manifest.id,
    packVersion: candidate.canonical.manifest.packVersion,
    contractVersion: MAPPING_PACK_CONTRACT_VERSION,
    contentDigest: candidate.digest,
    domainId: candidate.registration.domainId,
    selection,
  };
  return {
    pin,
    canonical: candidate.canonical,
    declarativeRaw: candidate.declarativeRaw,
  };
}

function shouldUseGenericFallback(input: ResolveMappingPackForDomainOptions): boolean {
  if (input.domainResolution === "unknown" || input.domainResolution === "unresolved") {
    return true;
  }
  const domainId = input.domainId?.trim();
  if (!domainId) {
    return true;
  }
  const specialized = (input.registrations ?? listMappingPackRegistrations()).filter(
    (entry) => entry.eligible && !entry.isGenericFallback && entry.domainId === domainId,
  );
  return specialized.length === 0;
}

export function resolveMappingPackForDomain(
  input: ResolveMappingPackForDomainOptions,
): ResolvedMappingPack {
  const allowPrerelease = input.allowPrerelease === true;
  const registrations = input.registrations ?? listMappingPackRegistrations();

  if (shouldUseGenericFallback(input)) {
    const genericReg = genericFallbackRegistration();
    const loaded = loadRegistrationCandidate(genericReg, input.repoRoot, true);
    if ("invalid" in loaded) {
      throw new MappingPackResolutionError(
        "MAPPING_PACK_INVALID",
        `Generic fallback pack invalid: ${loaded.errors.join("; ")}`,
      );
    }
    return buildResolved(loaded, "generic_fallback");
  }

  const domainId = input.domainId!.trim();
  const candidates = registrations.filter(
    (entry) => entry.eligible && !entry.isGenericFallback && entry.domainId === domainId,
  );
  if (candidates.length === 0) {
    throw new MappingPackResolutionError(
      "MAPPING_PACK_UNAVAILABLE",
      `No registered mapping packs for domain ${domainId}`,
    );
  }

  const resolved: LoadedCandidate[] = [];
  const invalidReports: string[] = [];

  for (const registration of candidates) {
    const loaded = loadRegistrationCandidate(registration, input.repoRoot, allowPrerelease);
    if ("invalid" in loaded) {
      invalidReports.push(`${registration.domainId}@${registration.packRootRelative}: ${loaded.errors.join(", ")}`);
      continue;
    }
    resolved.push(loaded);
  }

  if (resolved.length === 0) {
    throw new MappingPackResolutionError(
      "MAPPING_PACK_INVALID",
      `No valid compatible mapping pack for domain ${domainId}. ${invalidReports.join(" | ")}`,
    );
  }

  resolved.sort((a, b) => compareSemver(b.semver, a.semver));
  return buildResolved(resolved[0]!, "specialized");
}

export function resolvePinnedMappingPack(input: ResolvePinnedMappingPackOptions): ResolvedMappingPack {
  const registrations = input.registrations ?? listMappingPackRegistrations();
  const packId = input.pin.packId.trim();
  const packVersion = input.pin.packVersion.trim();
  const expectedDigest = input.pin.contentDigest.trim();

  const matches = registrations.filter((entry) => entry.eligible);
  const loaded: LoadedCandidate[] = [];

  for (const registration of matches) {
    const candidate = loadRegistrationCandidate(registration, input.repoRoot, true);
    if ("invalid" in candidate) {
      continue;
    }
    if (candidate.canonical.manifest.id !== packId) {
      continue;
    }
    if (candidate.canonical.manifest.packVersion !== packVersion) {
      continue;
    }
    loaded.push(candidate);
  }

  if (loaded.length === 0) {
    throw new MappingPackResolutionError(
      "MAPPING_PACK_NOT_FOUND",
      `No registered mapping pack matches pin ${packId}@${packVersion}`,
    );
  }

  loaded.sort((a, b) => compareSemver(b.semver, a.semver));
  const winner = loaded[0]!;
  if (winner.digest !== expectedDigest) {
    throw new MappingPackResolutionError(
      "MAPPING_PACK_PIN_MISMATCH",
      `Pack digest mismatch for ${packId}@${packVersion}: expected ${expectedDigest}, actual ${winner.digest}`,
    );
  }

  const selection: MappingPackPin["selection"] = winner.registration.isGenericFallback
    ? "generic_fallback"
    : "specialized";
  return buildResolved(winner, selection);
}

export function declarativeRawForResolvedPack(resolved: ResolvedMappingPack) {
  if (resolved.declarativeRaw) {
    return resolved.declarativeRaw;
  }
  return mappingPackToDeclarativeRaw(resolved.canonical);
}
