const LOCAL_REDIRECT_BASE = "http://localhost";

/**
 * In-app path for the post-OAuth return. Rejects absolute and protocol-relative targets.
 */
export function sanitizeOAuthNextPath(nextPath: string | null | undefined): string {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//") || nextPath.includes("\\")) {
    return "/";
  }
  try {
    const url = new URL(nextPath, LOCAL_REDIRECT_BASE);
    if (url.origin !== LOCAL_REDIRECT_BASE) {
      return "/";
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return "/";
  }
}
