/**
 * Temporary Vercel preview gate. Enabled only when HIVE_PREVIEW_PASSWORD is non-empty.
 * The password stays server-side (never NEXT_PUBLIC_*).
 */

export function isPreviewPasswordGateEnabled(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(source.HIVE_PREVIEW_PASSWORD?.trim());
}

/** HTTP Basic password, username ignored. Null when the header is missing or malformed. */
export function readBasicAuthPassword(authorization: string | null): string | null {
  if (!authorization) {
    return null;
  }
  const match = /^Basic\s+(\S+)$/i.exec(authorization.trim());
  if (!match?.[1]) {
    return null;
  }
  let decoded: string;
  try {
    const binary = atob(match[1]);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    decoded = new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) {
    return null;
  }
  return decoded.slice(separator + 1);
}

/** Compares the provided password to the gate secret without short-circuiting on mismatch. */
export function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return mismatch === 0;
}

export function authorizationMatchesPreviewPassword(
  authorization: string | null,
  source: Record<string, string | undefined> = process.env,
): boolean {
  const expected = source.HIVE_PREVIEW_PASSWORD?.trim() ?? "";
  if (!expected) {
    return false;
  }
  const provided = readBasicAuthPassword(authorization);
  if (provided === null) {
    return false;
  }
  return constantTimeEqual(provided, expected);
}

/** Debug surfaces are off unless explicitly enabled (never by default in production). */
export function isHiveDebugRoutesEnabled(
  source: Record<string, string | undefined> = process.env,
): boolean {
  return source.HIVE_ENABLE_DEBUG_ROUTES?.trim() === "true";
}

export function isHiveDebugApiPath(pathname: string): boolean {
  if (!pathname.startsWith("/api/case/")) {
    return false;
  }
  return (
    pathname.includes("/canonical-debug") ||
    pathname.includes("/raw-extraction") ||
    pathname.includes("/canonical-study/run") ||
    pathname.includes("/shadow-study")
  );
}

export function isHiveDebugPagePath(pathname: string): boolean {
  return (
    /^\/hives\/[^/]+\/canonical-debug\/?$/i.test(pathname) ||
    /^\/hives\/[^/]+\/extraction-debug\/?$/i.test(pathname)
  );
}
