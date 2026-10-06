// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractNativeWords } from "./extract-native-words";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const corpusDir = join(packageRoot, "fixtures/l001");
const snapshotDir = join(corpusDir, "document-pages");
const REGEN_CMD =
  "pnpm --filter @hiveforyou/intake exec tsx scripts/generate-l001-document-pages.mjs";

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return v;
  });
}

describe("L001 document-pages snapshots", () => {
  const pdfNames = readdirSync(corpusDir)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort();

  it.each(pdfNames)("matches committed snapshot for %s", async (pdfName) => {
    const pdfPath = join(corpusDir, pdfName);
    const bytes = readFileSync(pdfPath);
    const sourcePdfSha256 = createHash("sha256").update(bytes).digest("hex");
    const documentPages = await extractNativeWords(bytes, {
      documentId: pdfName,
      sha256: sourcePdfSha256,
    });
    const fresh = {
      sourcePdfFileName: pdfName,
      sourcePdfSha256,
      documentPages,
    };
    const snapshotPath = join(snapshotDir, `${pdfName.replace(/\.pdf$/i, "")}.json`);
    const committed = JSON.parse(readFileSync(snapshotPath, "utf8"));
    expect(stableStringify(fresh), `Snapshot drift — regenerate: ${REGEN_CMD}`).toBe(
      stableStringify(committed),
    );
  });

  it("names regen command when snapshots drift", () => {
    expect(REGEN_CMD).toContain("generate-l001-document-pages.mjs");
  });
});
