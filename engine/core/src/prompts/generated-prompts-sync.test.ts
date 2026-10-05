import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  collectPromptEntries,
  defaultOutFile,
  defaultPromptsRoot,
  renderGeneratedPromptsModule,
} from "../../scripts/generate-prompts.mjs";

const coreRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("generated-prompts.ts sync", () => {
  it("matches engine/core/prompts/**/*.md (run pnpm generate:prompts in @hiveforyou/core)", () => {
    const entries = collectPromptEntries(defaultPromptsRoot);
    const expected = renderGeneratedPromptsModule(entries);
    const actual = readFileSync(defaultOutFile, "utf8").replace(/\r\n/g, "\n");
    if (actual !== expected) {
      throw new Error(
        "generated-prompts.ts is out of date with engine/core/prompts — run: pnpm --filter @hiveforyou/core generate:prompts",
      );
    }
    expect(entries.length).toBeGreaterThan(0);
  });

  it("does not read prompts from disk at runtime in core loaders", () => {
    const promptsDir = join(coreRoot, "src/prompts");
    const studyDir = join(coreRoot, "src/study");
    const patterns = [
      /readFileSync\([^)]*prompts\//,
      /readFile\([^)]*prompts\//,
      /engine\/core\/prompts/,
    ];
    const filesToScan = [
      join(promptsDir, "load-canonical-study-prompt.ts"),
      join(promptsDir, "load-discover-prompt.ts"),
      join(promptsDir, "load-discover-resolution-prompt.ts"),
      join(studyDir, "client-writer-pass.ts"),
      join(studyDir, "client-summary-pass.ts"),
    ];
    for (const file of filesToScan) {
      const source = readFileSync(file, "utf8");
      for (const pattern of patterns) {
        expect(source, file).not.toMatch(pattern);
      }
    }
  });
});
