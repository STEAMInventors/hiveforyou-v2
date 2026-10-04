/** Structured intake/study timing — IDs, counts, and ms only (never document text). */
export function logStageTiming(payload: Record<string, unknown>): void {
  console.info("[hive/timing]", JSON.stringify(payload));
}

export function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}
