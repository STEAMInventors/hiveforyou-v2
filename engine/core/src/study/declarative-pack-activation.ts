export function isDeclarativeStudyPackResolverEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.HIVE_DECLARATIVE_STUDY_PACK_RESOLVER === "1";
}

/** Production remains on legacy pack paths until this gate and qualification are explicitly approved. */
export const DECLARATIVE_STUDY_PACK_ACTIVATION_ENV = "HIVE_DECLARATIVE_STUDY_PACK_RESOLVER" as const;
