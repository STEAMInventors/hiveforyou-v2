import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { iepScanDocumentFromNormalized } from "../adapters/from-normalized-extraction";
import { classifyIepDocumentLocally } from "../document-interpreter/classify-local";

const corpusDir =
  process.env.L001_CORPUS_DIR ??
  "C:/Users/abhattacharyya/nestiep-corpus/cases/L001/clean";
const nestiepRoot = process.env.NESTIEP_ROOT ?? "C:/Users/abhattacharyya/nestiep";

type ParityRow = {
  source: string;
  nestFamily: string;
  hiveFamily: string;
  nestSubtype: string | null;
  hiveSubtype: string | null;
  match: boolean;
};

describe("L001 parity (NestIEP local classifier vs Hive IEP Pack)", () => {
  it("compares classifications when corpus and NestIEP checkout exist", async () => {
    if (!existsSync(corpusDir)) {
      return;
    }
    const nestClassifierPath = join(nestiepRoot, "lib/scan/classifier.ts");
    if (!existsSync(nestClassifierPath)) {
      return;
    }
    const { classifyDocumentLocally } = await import(pathToFileURL(nestClassifierPath).href);
    const { extractDocument } = await import(
      pathToFileURL(join(process.cwd(), "../../packages/intake/src/extract-document.ts")).href
    );

    const pdfs = readdirSync(corpusDir).filter((name) => name.toLowerCase().endsWith(".pdf"));
    expect(pdfs.length).toBeGreaterThan(0);

    const rows: ParityRow[] = [];
    for (const name of pdfs) {
      const bytes = readFileSync(join(corpusDir, name));
      const extracted = await extractDocument({
        documentId: name,
        bytes,
        mimeType: "application/pdf",
        sourceHash: "l001-parity",
        runId: "l001-parity",
      });
      const normalized = extracted.normalizedExtraction;
      if (!normalized) {
        continue;
      }
      const id = basename(name, ".pdf");
      const nestDoc = {
        scanDocumentId: id,
        originalDisplayName: name,
        mimeType: "application/pdf",
        pageCount: normalized.pages.length,
        pages: normalized.pages.map((page) => ({
          pageNumber: page.pageNumber,
          text: page.canonicalText,
        })),
        readStatus: "ok" as const,
      };
      const hiveDoc = iepScanDocumentFromNormalized({
        sourceDocumentId: id,
        filename: name,
        mimeType: normalized.mimeType,
        normalized,
      });
      const nest = classifyDocumentLocally(nestDoc);
      const hive = classifyIepDocumentLocally(hiveDoc);
      const hiveFamily = hive.family === "OTHER" ? "OTHER_EDUCATIONAL" : hive.family;
      rows.push({
        source: name,
        nestFamily: nest.family,
        hiveFamily,
        nestSubtype: nest.subtype,
        hiveSubtype: hive.subtype,
        match: nest.family === hive.family && (nest.subtype ?? null) === (hive.subtype ?? null),
      });
    }

    const outDir = join(process.cwd(), "artifacts");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "l001-parity-report.json"), JSON.stringify(rows, null, 2));

    const nonOther = rows.filter((row) => row.hiveFamily !== "OTHER_EDUCATIONAL");
    expect(nonOther.length).toBeGreaterThan(0);
  });
});
