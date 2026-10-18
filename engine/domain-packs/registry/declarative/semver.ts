export type ParsedSemver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  raw: string;
};

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parseSemver(input: string): ParsedSemver | null {
  const trimmed = input.trim();
  const match = SEMVER_RE.exec(trimmed);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null,
    raw: trimmed,
  };
}

/** Normalize pack labels like `0.2.1-draft` to semver `0.2.1` with prerelease `draft`. */
export function normalizePackVersionLabel(label: string): ParsedSemver | null {
  const trimmed = label.trim();
  const direct = parseSemver(trimmed);
  if (direct) {
    return direct;
  }
  const draftSuffix = /^(\d+\.\d+\.\d+)-([0-9A-Za-z.-]+)$/.exec(trimmed);
  if (!draftSuffix) {
    return null;
  }
  return parseSemver(`${draftSuffix[1]}-${draftSuffix[2]}`);
}

export function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return a.prerelease.localeCompare(b.prerelease);
}

export function isPrerelease(version: ParsedSemver): boolean {
  return version.prerelease != null && version.prerelease.length > 0;
}
