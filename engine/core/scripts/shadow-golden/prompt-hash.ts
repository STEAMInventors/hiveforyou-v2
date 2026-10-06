import { createHash } from "node:crypto";

import type { ModelRequest } from "../../src/model/call-model.ts";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortValue(record[key]);
    }
    return sorted;
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function hashPromptRequest(req: ModelRequest): string {
  const textFormat =
    req.textFormat.type === "json_schema"
      ? { type: req.textFormat.type, name: req.textFormat.name, schema: req.textFormat.schema }
      : { type: req.textFormat.type };
  return createHash("sha256")
    .update(
      stableJson({
        systemPrompt: req.systemPrompt ?? "",
        userContent: req.userContent,
        textFormat,
      }),
    )
    .digest("hex");
}

export function recordingKey(docSha256: string, promptHash: string): string {
  return `${docSha256}:${promptHash}`;
}
