import { timingSafeEqual } from "node:crypto";

export function parseBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorizationHeader);
  if (!match) {
    return null;
  }
  return match[1] ?? null;
}

export function tokensEqual(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function isAuthorized(input: {
  authorizationHeader: string | undefined;
  expectedToken: string;
}): boolean {
  const provided = parseBearerToken(input.authorizationHeader);
  if (provided == null) {
    return false;
  }
  return tokensEqual(input.expectedToken, provided);
}
