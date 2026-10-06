import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createCallModelFromEnv } from "@hiveforyou/model-providers/env";

import { diffExpected, formatDiffSummary } from "./diff-expected.ts";
import { loadShadowCase, type ShadowCaseId } from "./load-case.ts";
import { buildExpectedGolden, sortExpectedGolden } from "./normalize-expected.ts";
import {
  createRecordingCallModel,
  loadRecordings,
  writeRecordings,
  type RecordingsFile,
} from "./recording-call-model.ts";
import { stableJson } from "./prompt-hash.ts";
import { runShadowGoldenPipeline } from "./run-pipeline.ts";

export type GoldenShadowOptions = {
  caseId: ShadowCaseId;
  record: boolean;
  update: boolean;
  reason?: string;
};

async function runPipelineOnce(input: {
  caseId: ShadowCaseId;
  record: boolean;
  recordingsPath: string;
  recordings: RecordingsFile;
}) {
  const loaded = await loadShadowCase(input.caseId);
  let currentDocSha256 = "";
  const { callModel: liveModel, modelName } = input.record
    ? createCallModelFromEnv()
    : { callModel: undefined, modelName: "replay" };

  const callModel = createRecordingCallModel({
    mode: input.record ? "record" : "replay",
    recordings: input.recordings,
    inner: liveModel,
    getDocSha256: () => currentDocSha256,
  });

  const pipeline = await runShadowGoldenPipeline({
    documents: loaded.documents,
    callModel,
    model: input.record ? modelName : "replay",
    v4Claims: loaded.v4Claims,
    sourceIdToDocumentId: loaded.sourceIdToDocumentId,
    setDocSha256: (sha256) => {
      currentDocSha256 = sha256;
    },
  });

  if (input.record) {
    writeRecordings(input.recordingsPath, input.recordings);
  }

  const shaByDocId = new Map(loaded.documents.map((d) => [d.filename, d.sha256]));
  const expected = sortExpectedGolden(buildExpectedGolden(pipeline, shaByDocId));
  return { loaded, expected, pipeline };
}

export async function executeGoldenShadow(options: GoldenShadowOptions): Promise<number> {
  if (options.update && !options.reason?.trim()) {
    console.error("--update requires --reason");
    return 1;
  }

  const loaded = await loadShadowCase(options.caseId);
  const recordingsPath = join(loaded.goldenDir, "recordings.json");
  const expectedPath = join(loaded.goldenDir, "expected.json");

  let recordings: RecordingsFile = {};
  if (options.record || options.update) {
    if (existsSync(recordingsPath)) {
      recordings = loadRecordings(recordingsPath);
    }
  } else if (!existsSync(recordingsPath)) {
    console.error(`Missing recordings: ${recordingsPath} (run with --record first)`);
    return 1;
  } else {
    recordings = loadRecordings(recordingsPath);
  }

  if (options.record) {
    await runPipelineOnce({
      caseId: options.caseId,
      record: true,
      recordingsPath,
      recordings,
    });
    recordings = loadRecordings(recordingsPath);
  }

  const { expected, pipeline } = await runPipelineOnce({
    caseId: options.caseId,
    record: false,
    recordingsPath,
    recordings,
  });

  if (options.update) {
    writeFileSync(expectedPath, `${stableJson(expected)}\n`, "utf8");
    const changelog = join(loaded.goldenDir, "CHANGELOG.md");
    const line = `- ${new Date().toISOString().slice(0, 10)}: expected.json — ${options.reason!.trim()}\n`;
    if (existsSync(changelog)) {
      appendFileSync(changelog, line, "utf8");
    } else {
      writeFileSync(changelog, `# Shadow golden changelog (${options.caseId})\n\n${line}`, "utf8");
    }
    console.info(`Updated ${expectedPath}`);
    console.info(
      `Coverage: ${expected.coverage.covered}/${expected.coverage.total}; documents=${Object.keys(expected.documents).length}; findings=${expected.findings.length}`,
    );
    return 0;
  }

  if (!existsSync(expectedPath)) {
    console.error(`Missing expected golden: ${expectedPath}`);
    return 1;
  }

  const baseline = sortExpectedGolden(
    JSON.parse(readFileSync(expectedPath, "utf8")) as ReturnType<typeof buildExpectedGolden>,
  );
  const diff = diffExpected(expected, baseline);
  console.info(formatDiffSummary(diff));
  if (!diff.equal) {
    return 1;
  }

  console.info(
    `OK ${options.caseId}: coverage ${expected.coverage.covered}/${expected.coverage.total}, findings=${expected.findings.length}, tier1 ran=${pipeline.documents.filter((d) => d.tier1Status === "ran").length}/${pipeline.documents.length}`,
  );
  return 0;
}
