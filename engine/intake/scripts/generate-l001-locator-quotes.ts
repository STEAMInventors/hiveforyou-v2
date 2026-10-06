import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { recoverNormalizedDocument } from "../src/extraction/nestiep/recover-document";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const corpusDir = join(packageRoot, "fixtures/l001");

const quotes: Array<{ file: string; pageNumber: number; quote: string }> = [];
for (const name of readdirSync(corpusDir)
  .filter((entry) => entry.toLowerCase().endsWith(".pdf"))
  .sort()) {
  const bytes = readFileSync(join(corpusDir, name));
  const sourceHash = createHash("sha256").update(bytes).digest("hex");
  const normalized = await recoverNormalizedDocument({
    sourceDocumentId: name,
    sourceHash,
    bytes,
    mimeType: "application/pdf",
    ocrEngine: null,
  });
  for (const page of normalized.pages) {
    for (const line of page.lines) {
      const quote = line.text.trim();
      if (quote.length >= 12 && quote.length <= 140) {
        quotes.push({ file: name, pageNumber: page.pageNumber, quote });
      }
    }
  }
}

writeFileSync(join(corpusDir, "locator-quotes.json"), `${JSON.stringify(quotes, null, 2)}\n`, "utf8");
console.error(`Wrote ${quotes.length} locator quotes`);
