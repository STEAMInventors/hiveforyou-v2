import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CallModel } from "../../src/model/call-model.ts";
import { diffExpected, formatDiffSummary } from "./diff-expected.ts";
import { sortExpectedGolden, type ExpectedGolden } from "./normalize-expected.ts";
import { repoRoot } from "./paths.ts";
import { createRecordingCallModel } from "./recording-call-model.ts";

const l001Golden = join(repoRoot(), "engine/intake/fixtures/golden/shadow/l001");

function runGoldenCli(args: string[]) {
  return spawnSync(
    "pnpm",
    ["exec", "tsx", "scripts/golden-shadow-study.mjs", ...args],
    {
      cwd: join(repoRoot(), "engine/core"),
      env: process.env,
      encoding: "utf8",
      shell: true,
    },
  );
}

function loadExpected(): ExpectedGolden | null {
  const path = join(l001Golden, "expected.json");
  if (!existsSync(path)) {
    return null;
  }
  return sortExpectedGolden(JSON.parse(readFileSync(path, "utf8")) as ExpectedGolden);
}

describe("shadow golden replay", () => {
  it("identical L001 replay exits 0 when goldens exist", () => {
    if (!existsSync(join(l001Golden, "recordings.json")) || !loadExpected()) {
      return;
    }
    const result = runGoldenCli(["--case", "l001"]);
    expect(result.status).toBe(0);
    expect(result.stdout ?? "").toContain("Golden match");
  });

  it("diff summary names findings section and key", () => {
    const baseline = loadExpected();
    if (!baseline || baseline.findings.length === 0) {
      return;
    }
    const actual = structuredClone(baseline);
    const target = actual.findings[0]!;
    target.key = `${target.key}-mutated`;
    const diff = diffExpected(actual, baseline);
    expect(diff.equal).toBe(false);
    const summary = formatDiffSummary(diff);
    expect(summary).toMatch(/findings/i);
    expect(summary).toMatch(/added|removed|changed/i);
  });

  it("missing recording errors with doc sha256 and prompt hash", async () => {
    let liveCalls = 0;
    const inner: CallModel = async () => {
      liveCalls += 1;
      return { outputText: "{}", usage: {} };
    };
    const callModel = createRecordingCallModel({
      mode: "replay",
      recordings: {},
      inner,
      getDocSha256: () => "abc123deadbeef",
    });
    await expect(
      callModel({
        model: "replay",
        userContent: "section text",
        systemPrompt: "system",
        textFormat: { type: "json_object" },
      }),
    ).rejects.toThrow(/RECORDING_MISSING:docSha256=abc123deadbeef:promptHash=/);
    expect(liveCalls).toBe(0);
  });

  it("two consecutive replays produce identical stdout", () => {
    if (!existsSync(join(l001Golden, "recordings.json")) || !loadExpected()) {
      return;
    }
    const first = runGoldenCli(["--case", "l001"]);
    const second = runGoldenCli(["--case", "l001"]);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stdout).toBe(second.stdout);
  });
});
