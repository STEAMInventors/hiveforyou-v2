import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractDocument } from "../extract-document";
import {
  snapshotFromExtraction,
  type ExtractionFixtureGolden,
} from "./extraction-fixture-snapshot";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, "../../fixtures/extraction");
const FILES_DIR = join(FIXTURE_ROOT, "files");
const GOLDEN_DIR = join(FIXTURE_ROOT, "golden");

const UPDATE_GOLDENS = process.env.UPDATE_EXTRACTION_FIXTURE_GOLDENS === "1";

type FixtureCase = {
  caseId: string;
  fixtureFile: string;
  mimeType: string | null;
  comment?: string;
};

const CASES: FixtureCase[] = [
  { caseId: "01-scanned-image-only", fixtureFile: "01-scanned-image-only.pdf", mimeType: "application/pdf" },
  { caseId: "02-short-signature", fixtureFile: "02-short-signature.pdf", mimeType: "application/pdf" },
  { caseId: "03-kerning-splits", fixtureFile: "03-kerning-splits.pdf", mimeType: "application/pdf" },
  {
    caseId: "04-two-column-narrative",
    fixtureFile: "04-two-column-narrative.pdf",
    mimeType: "application/pdf",
    comment:
      "Column order follows PDF reading order (often interleaved L/R lines) until C4 column segmentation lands; snapshot reflects current behavior.",
  },
  { caseId: "05-encrypted", fixtureFile: "05-encrypted.pdf", mimeType: "application/pdf" },
  { caseId: "06-corrupted-middle-page", fixtureFile: "06-corrupted-middle-page.pdf", mimeType: "application/pdf" },
  {
    caseId: "07-plain-utf8",
    fixtureFile: "07-plain-utf8.txt",
    mimeType: "text/plain; charset=utf-8",
  },
  { caseId: "08-plain-utf16-bom", fixtureFile: "08-plain-utf16-bom.txt", mimeType: "text/plain" },
  {
    caseId: "09-sample-docx",
    fixtureFile: "09-sample.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  { caseId: "10-mixed-native-scanned", fixtureFile: "10-mixed-native-scanned.pdf", mimeType: "application/pdf" },
  {
    caseId: "11-word-space-gap",
    fixtureFile: "11-word-space-gap.pdf",
    mimeType: "application/pdf",
    comment: "Score and 85 are separated by a word-sized gap and stay two tokens.",
  },
  {
    caseId: "12-score-kerning-baked-item",
    fixtureFile: "12-score-kerning-baked-item.pdf",
    mimeType: "application/pdf",
    comment: "Word gap before digits; baked single-item kerning space stays as 8 5.",
  },
  {
    caseId: "13-grades-spaced-digits",
    fixtureFile: "13-grades-spaced-digits.pdf",
    mimeType: "application/pdf",
  },
  { caseId: "14-date-spaced", fixtureFile: "14-date-spaced.pdf", mimeType: "application/pdf" },
  { caseId: "15-phone-spaced", fixtureFile: "15-phone-spaced.pdf", mimeType: "application/pdf" },
];

async function extractFixture(testCase: FixtureCase): Promise<ExtractionFixtureGolden> {
  const path = join(FILES_DIR, testCase.fixtureFile);
  if (!existsSync(path)) {
    throw new Error(
      `Missing fixture ${testCase.fixtureFile}. Run: node fixtures/extraction/generate-fixtures.mjs`,
    );
  }
  const bytes = new Uint8Array(readFileSync(path));
  const sourceHash = createHash("sha256").update(bytes).digest("hex");
  const result = await extractDocument(
    {
      documentId: `fixture-${testCase.caseId}`,
      bytes,
      mimeType: testCase.mimeType,
      sourceHash,
    },
    { ocrEngine: null },
  );
  return snapshotFromExtraction(
    {
      caseId: testCase.caseId,
      fixtureFile: testCase.fixtureFile,
      mimeType: testCase.mimeType,
      ...(testCase.comment === undefined ? {} : { comment: testCase.comment }),
    },
    result,
  );
}

describe("extraction fixture goldens", () => {
  it.each(CASES)("$caseId matches golden snapshot", async (testCase) => {
    const snapshot = await extractFixture(testCase);
    const goldenPath = join(GOLDEN_DIR, `${testCase.caseId}.json`);

    if (UPDATE_GOLDENS) {
      mkdirSync(GOLDEN_DIR, { recursive: true });
      writeFileSync(goldenPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      return;
    }

    expect(existsSync(goldenPath), `Missing golden ${goldenPath}`).toBe(true);
    const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as ExtractionFixtureGolden;
    expect(snapshot).toEqual(golden);
  });
});
