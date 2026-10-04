export function buildSourceDocumentFileHref(
  studyRunId: string,
  sourceDocumentId: string,
  page?: number | null,
  options?: { originalFilename?: string | null },
): string {
  const params = new URLSearchParams();
  const filename = options?.originalFilename?.trim();
  if (filename) {
    params.set("filename", filename);
  }
  const query = params.toString();
  const base = `/api/study/runs/${encodeURIComponent(studyRunId)}/sources/${encodeURIComponent(sourceDocumentId)}/file${query ? `?${query}` : ""}`;
  if (page == null || Number.isNaN(page)) {
    return base;
  }
  return `${base}#page=${page}`;
}
