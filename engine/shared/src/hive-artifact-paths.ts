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
