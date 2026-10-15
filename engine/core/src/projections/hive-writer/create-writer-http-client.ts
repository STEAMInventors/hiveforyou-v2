import type { HiveWriterModelInput, HiveWriterProposal } from "@hiveforyou/shared/hive-writer-proposal";

export type HiveWriterHttpResponse = {
  proposal: HiveWriterProposal;
  modelIdentifier: string;
  tokenUsage: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    cacheReadInputTokens?: number | null;
    cacheWriteInputTokens?: number | null;
  } | null;
};

export type HiveWriterHttpClient = (input: HiveWriterModelInput) => Promise<HiveWriterHttpResponse>;

export function createWriterHttpClient(env: Record<string, string | undefined>): HiveWriterHttpClient {
  const token = env.HIVE_AGENTS_SERVICE_TOKEN?.trim();
  const host = env.HIVE_AGENTS_HOST?.trim() || "127.0.0.1";
  const port =
    env.HIVE_AGENTS_PORT?.trim() ||
    env.HIVE_AGENTS_BIND_PORT?.trim() ||
    "4320";
  const url = `http://${host}:${port}/study/writer`;
  if (!token) {
    throw new Error("HIVE_AGENTS_SERVICE_TOKEN is required for Hive Writer.");
  }
  return async (input) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ schemaVersion: "study-writer/1", input }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`WRITER_HTTP_${response.status}:${body.slice(0, 200)}`);
    }
    return (await response.json()) as HiveWriterHttpResponse;
  };
}
