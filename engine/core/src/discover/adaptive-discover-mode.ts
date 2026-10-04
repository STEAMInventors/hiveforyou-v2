/** Adaptive Engine 1 V2 is selected by explicit prompt version — V1 remains default. */

export function isAdaptiveDiscoverPromptVersion(promptVersionRequest: string): boolean {
  const normalized = promptVersionRequest.trim().toLowerCase();
  return (
    normalized === "discover-v2" ||
    normalized === "v2" ||
    normalized === "discover-v2.md"
  );
}
