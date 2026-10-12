import type { StudyReaderRequestWire } from "./document-pages-to-reader-request.js";
import type { StudyReaderResponseWire } from "./run-agentic-reader-qualification.js";

export function createReaderHttpClient(env: Record<string, string | undefined>): (
  request: StudyReaderRequestWire,
) => Promise<StudyReaderResponseWire> {
  const token = env.HIVE_AGENTS_SERVICE_TOKEN?.trim();
  const host = env.HIVE_AGENTS_HOST?.trim() || "127.0.0.1";
  const port =
    env.HIVE_AGENTS_PORT?.trim() ||
    env.HIVE_AGENTS_BIND_PORT?.trim() ||
    "4320";
  const url = `http://${host}:${port}/study/reader`;
  if (!token) {
    throw new Error("HIVE_AGENTS_SERVICE_TOKEN is required for pack-driven Reader.");
  }
  return async (request) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`READER_HTTP_${response.status}:${body.slice(0, 200)}`);
    }
    return (await response.json()) as StudyReaderResponseWire;
  };
}
