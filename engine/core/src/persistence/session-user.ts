export class UnauthenticatedError extends Error {
  readonly code = "UNAUTHENTICATED";

  constructor() {
    super("Authenticated session is required.");
    this.name = "UnauthenticatedError";
  }
}

/** Ownership comes from the authenticated session, never from a browser-supplied user id. */
export function requireSessionUserId(
  sessionUserId: string | null | undefined,
): string {
  const userId = sessionUserId?.trim();
  if (!userId) {
    throw new UnauthenticatedError();
  }
  return userId;
}

export function withSessionOwner<T extends Record<string, unknown>>(
  sessionUserId: string | null | undefined,
  row: T,
): T & { user_id: string } {
  return {
    ...row,
    user_id: requireSessionUserId(sessionUserId),
  };
}
