import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const corpusDir = join(packageRoot, "fixtures/l001");

const EXPECTED_SHA256: Record<string, string> = {
  "01_initial_referral.pdf": "8ae4ac0ce3009151dea07f9751e65fab11d9147a67f2eec2f5f1ecd09be4629d",
  "02_evaluation_plan.pdf": "ffd4ebe21c06d6e365d9d581b996e17a79a7f81207722e83b1c1005dc70935c6",
  "03_parent_evaluation_consent.pdf": "864013b7e57a576ce6587589c67baa03003cf56c7cf0fb4fc01c2f6b43aded9c",
  "04_psychoeducational_evaluation.pdf": "7496e950f951b666a7d532ad8c8d782946b60688650084c84b5ebebf9b17ef7d",
  "05_academic_evaluation.pdf": "5fde3e11eaeb224daa7df5a61e72dd9d351dc6c02ee634e5ee51ee478449ec3f",
  "06_speech_language_evaluation.pdf": "8adc5107634a1be4ab7d9b4f0817b0f254331ce1598de4ac5a859d1257e810fd",
  "07_eligibility_determination.pdf": "35b0594bbbbc68239a3dad3a657290b1ea08093e2290a0d093ef716ca1c72ba2",
  "08_initial_iep.pdf": "1e6b380e4a348029a97d1648228530b8cb060609c1ec30404cc43545d9833e2c",
};

describe("L001 fixture integrity", () => {
  it("matches pinned SHA-256 for each committed PDF", () => {
    for (const [fileName, expected] of Object.entries(EXPECTED_SHA256)) {
      const bytes = readFileSync(join(corpusDir, fileName));
      const actual = createHash("sha256").update(bytes).digest("hex");
      expect(actual, fileName).toBe(expected);
    }
  });
});
