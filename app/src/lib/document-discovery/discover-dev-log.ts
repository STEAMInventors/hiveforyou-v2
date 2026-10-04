/** Temporary boundary logging for discover UX debugging (development only). */
export function logDiscoverClientBoundary(
  boundary: string,
  detail?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  if (detail) {
    console.info(`[discover:client] ${boundary}`, detail);
  } else {
    console.info(`[discover:client] ${boundary}`);
  }
}
