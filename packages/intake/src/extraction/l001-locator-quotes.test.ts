// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractNativeWords } from "./extract-native-words";
import { findConsecutiveWordQuote } from "./find-consecutive-word-quote";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const corpusDir = process.env.L001_CORPUS_DIR ?? join(packageRoot, "fixtures/l001");
const quotesPath = join(corpusDir, "locator-quotes.json");

type LocatorQuote = { file: string; pageNumber: number; quote: string };

describe("L001 golden locator quotes", () => {
  it("every committed locator quote matches consecutive words with a bbox", async () => {
    expect(existsSync(quotesPath), "missing fixtures/l001/locator-quotes.json").toBe(true);
    const quotes = JSON.parse(readFileSync(quotesPath, "utf8")) as LocatorQuote[];
    expect(quotes.length).toBeGreaterThan(0);

    const bytesByFile = new Map<string, Uint8Array>();
    for (const entry of quotes) {
      if (!bytesByFile.has(entry.file)) {
        bytesByFile.set(entry.file, readFileSync(join(corpusDir, entry.file)));
      }
    }

    for (const entry of quotes) {
      const bytes = bytesByFile.get(entry.file)!;
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const documentPages = await extractNativeWords(bytes, {
        documentId: entry.file,
        sha256,
      });
      const page = documentPages.pages[entry.pageNumber - 1];
      expect(page, `${entry.file} page ${entry.pageNumber}`).toBeDefined();
      const match = findConsecutiveWordQuote(page!.words, entry.quote);
      expect(match, `quote not found as consecutive words: ${entry.quote}`).not.toBeNull();
      const [x0, y0, x1, y1] = match!.bbox;
      expect(x1).toBeGreaterThan(x0);
      expect(y1).toBeGreaterThan(y0);
    }
  });
});
