import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isCertifiedGoldenCase,
  isDraftGoldenCase,
  type GoldenCase,
  type GoldenSplit,
} from "../golden/types.js";
import { validateGoldenCase } from "../golden/validate.js";

export type GoldenSelectionSkip = {
  caseId: string;
  file: string;
  reason: "draft" | "unverified" | "invalid" | "wrong_split" | "no_matching_baseline";
  detail?: string;
};

export type GoldenSelectionResult = {
  goldens: GoldenCase[];
  skipped: GoldenSelectionSkip[];
};

export function listGoldensForSplit(input: {
  evalRoot: string;
  split: GoldenSplit;
}): GoldenSelectionResult {
  const splitDir = join(input.evalRoot, "golden", input.split);
  const entries = readdirSync(splitDir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const goldens: GoldenCase[] = [];
  const skipped: GoldenSelectionSkip[] = [];

  for (const file of entries) {
    const caseId = file.replace(/\.json$/i, "");
    const raw = JSON.parse(readFileSync(join(splitDir, file), "utf8")) as unknown;
    const validated = validateGoldenCase(raw);
    if (!validated.ok) {
      skipped.push({
        caseId,
        file,
        reason: "invalid",
        detail: validated.issues.map((i) => i.message).join("; "),
      });
      continue;
    }
    const golden = validated.value;
    if (golden.split !== input.split) {
      skipped.push({ caseId, file, reason: "wrong_split", detail: `split=${golden.split}` });
      continue;
    }
    if (isDraftGoldenCase(golden)) {
      skipped.push({ caseId, file, reason: "draft" });
      continue;
    }
    if (!isCertifiedGoldenCase(golden)) {
      skipped.push({ caseId, file, reason: "unverified" });
      continue;
    }
    goldens.push(golden);
  }

  goldens.sort((a, b) => a.caseId.localeCompare(b.caseId));
  return { goldens, skipped };
}
