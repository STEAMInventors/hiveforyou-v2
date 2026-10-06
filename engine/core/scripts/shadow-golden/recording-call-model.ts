import { readFileSync, writeFileSync } from "node:fs";

import type { CallModel, ModelRequest, ModelResponse } from "../../src/model/call-model.ts";
import { hashPromptRequest, recordingKey, stableJson } from "./prompt-hash.ts";

export type RecordingsFile = Record<
  string,
  {
    outputText: string | null;
  }
>;

export function loadRecordings(path: string): RecordingsFile {
  return JSON.parse(readFileSync(path, "utf8")) as RecordingsFile;
}

export function writeRecordings(path: string, recordings: RecordingsFile): void {
  const sorted: RecordingsFile = {};
  for (const key of Object.keys(recordings).sort()) {
    sorted[key] = recordings[key];
  }
  writeFileSync(path, `${stableJson(sorted)}\n`, "utf8");
}

export function createRecordingCallModel(input: {
  mode: "record" | "replay";
  recordings: RecordingsFile;
  inner?: CallModel;
  getDocSha256: () => string;
}): CallModel {
  return async (req: ModelRequest): Promise<ModelResponse> => {
    const docSha256 = input.getDocSha256();
    const promptHash = hashPromptRequest(req);
    const key = recordingKey(docSha256, promptHash);

    if (input.mode === "replay") {
      const hit = input.recordings[key];
      if (!hit) {
        throw new Error(`RECORDING_MISSING:docSha256=${docSha256}:promptHash=${promptHash}`);
      }
      return {
        outputText: hit.outputText,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }

    if (!input.inner) {
      throw new Error("RECORDING_INNER_MODEL_REQUIRED");
    }
    const response = await input.inner(req);
    input.recordings[key] = { outputText: response.outputText };
    return response;
  };
}
