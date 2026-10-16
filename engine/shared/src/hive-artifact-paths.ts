/** Private document-pages cache: `{userId}/document-pages/{sha256}.json` */
export function documentPagesStoragePath(userId: string, sha256: string): string {
  return `${userId}/document-pages/${sha256}.json`;
}

/** Sensitive shadow pipeline state: `{userId}/shadow-work/{studyRunId}/state.json` */
export function shadowWorkStatePath(userId: string, studyRunId: string): string {
  return `${userId}/shadow-work/${studyRunId}/state.json`;
}

/** Verifier-accepted Reader facts (quotes): `{userId}/reader-accepted-facts/{studyRunId}.json` */
export function readerAcceptedFactsStoragePath(userId: string, studyRunId: string): string {
  return `${userId}/reader-accepted-facts/${studyRunId}.json`;
}

/** Historical accepted-facts payload for one Reader attempt (retries retained). */
export function readerAcceptedFactsAttemptStoragePath(
  userId: string,
  studyRunId: string,
  attemptId: string,
): string {
  return `${userId}/reader-accepted-facts/${studyRunId}/${attemptId}.json`;
}

/** Raw pack-driven Reader model output per document (ARCH-02). */
export function readerDocumentExtractionEnvelopePath(
  userId: string,
  studyRunId: string,
  attemptId: string,
  sourceDocumentId: string,
): string {
  return `${userId}/reader-document-extractions/${studyRunId}/${attemptId}/${sourceDocumentId}.json`;
}

/** Attempt-scoped index of persisted document extraction envelopes. */
export function readerDocumentExtractionAttemptManifestPath(
  userId: string,
  studyRunId: string,
  attemptId: string,
): string {
  return `${userId}/reader-document-extractions/${studyRunId}/${attemptId}/manifest.json`;
}

/** Study-run pointer to the latest attempt manifest (metadata only). */
export function readerDocumentExtractionStudyRunManifestPath(
  userId: string,
  studyRunId: string,
): string {
  return `${userId}/reader-document-extractions/${studyRunId}/manifest.json`;
}

/** Deterministic canonical study foundation artifact (ARCH-05.1). */
export function canonicalStudyFoundationArtifactPath(
  userId: string,
  studyRunId: string,
  attemptId: string,
): string {
  return `${userId}/canonical-study-foundation/${studyRunId}/${attemptId}.json`;
}

/** Complete deterministic canonical study artifact (ARCH-05.2–05.4). */
export function canonicalStudyArtifactPath(
  userId: string,
  studyRunId: string,
  attemptId: string,
): string {
  return `${userId}/canonical-study/${studyRunId}/${attemptId}.json`;
}

/** One Writer shadow run record (immutable path per writerRunId). */
export function hiveWriterShadowRecordPath(
  userId: string,
  studyRunId: string,
  audience: "customer" | "pro",
  writerRunId: string,
): string {
  return `${userId}/hive-writer-shadow/${studyRunId}/${audience}/runs/${writerRunId}.json`;
}

/**
 * Pre–writer-run architecture: one record per projection binding hash.
 * @deprecated Read-only migration fallback; new runs use {@link hiveWriterShadowRecordPath}.
 */
export function hiveWriterShadowLegacyBindingRecordPath(
  userId: string,
  studyRunId: string,
  audience: "customer" | "pro",
  projectionBindingKey: string,
): string {
  return `${userId}/hive-writer-shadow/${studyRunId}/${audience}/${projectionBindingKey}.json`;
}

/** Pointer to the latest accepted Writer run for a study run and audience. */
export function hiveWriterShadowLatestAcceptedPath(
  userId: string,
  studyRunId: string,
  audience: "customer" | "pro",
): string {
  return `${userId}/hive-writer-shadow/${studyRunId}/${audience}/latest-accepted.json`;
}
