export const CANONICAL_STUDY_RUN_MANIFEST_SCHEMA_VERSION =
  "hive.canonical-study-run-manifest/1" as const;

export type CanonicalStudyRunManifestStatus = "SUCCEEDED" | "FAILED";

/** Study-run pointer to the latest deterministic canonical build (metadata only). */
export type CanonicalStudyRunManifest = {
  schemaVersion: typeof CANONICAL_STUDY_RUN_MANIFEST_SCHEMA_VERSION;
  studyRunId: string;
  caseId: string;
  latestAttemptId: string;
  inputSourceDocumentIds: string[];
  readerPackId: string;
  readerPackVersion: string;
  readerPackContentSha256: string;
  interpretationRulesetId: string | null;
  interpretationRulesetContentSha256: string | null;
  canonicalRulesetId: string;
  canonicalRulesetContentSha256: string;
  foundationObjectKey: string;
  artifactObjectKey: string;
  artifactContentSha256: string;
  status: CanonicalStudyRunManifestStatus;
  errorCode?: string;
  updatedAt: string;
};

export function canonicalStudyRunManifestPath(userId: string, studyRunId: string): string {
  return `${userId}/canonical-study/${studyRunId}/manifest.json`;
}
