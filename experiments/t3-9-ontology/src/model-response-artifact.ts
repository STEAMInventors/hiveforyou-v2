import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const MODEL_RESPONSE_ARTIFACT_SCHEMA = "t3-9-ontology/model-response/1";

export function writeModelResponseArtifact(input: {
  resultsDir: string;
  callId: string;
  outputText: string | null;
}): string {
  const safeId = input.callId.replace(/[^\w.-]+/g, "_");
  const dir = join(input.resultsDir, "model-responses");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${safeId}.json`);
  writeFileSync(
    path,
    JSON.stringify(
      {
        schemaVersion: MODEL_RESPONSE_ARTIFACT_SCHEMA,
        callId: input.callId,
        outputText: input.outputText ?? "",
      },
      null,
      2,
    ),
  );
  return path;
}