/**
 * L001 parity: NestIEP local classifier vs Hive IEP Pack (normalized adapter).
 *
 * Usage:
 *   node domain-packs/iep/scripts/l001-parity.mjs
 *
 * Env:
 *   L001_CORPUS_DIR — default C:/Users/abhattacharyya/nestiep-corpus/cases/L001/clean
 *   NESTIEP_ROOT — default C:/Users/abhattacharyya/nestiep
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const corpusDir =
  process.env.L001_CORPUS_DIR ??
  "C:/Users/abhattacharyya/nestiep-corpus/cases/L001/clean";
const nestiepRoot = process.env.NESTIEP_ROOT ?? "C:/Users/abhattacharyya/nestiep";

const repoRoot = join(import.meta.dirname, "../../..");
const hiveIep = await import(
  pathToFileURL(join(repoRoot, "domain-packs/iep/execute-intake.ts")).href
);
const hiveAdapter = await import(
  pathToFileURL(join(repoRoot, "domain-packs/iep/adapters/from-normalized-extraction.ts")).href
);
const hiveClassify = await import(
  pathToFileURL(join(repoRoot, "domain-packs/iep/document-interpreter/classify-local.ts")).href
);

// Dynamic import NestIEP classifier from local checkout (not vendored).
const nestClassifyPath = join(nestiepRoot, "lib/scan/classifier.ts");
const nestTitlePath = join(nestiepRoot, "lib/scan/title-candidate.ts");

async function loadNestiepClassifier() {
  const nestiepTs = await import(pathToFileURL(nestClassifyPath).href);
  return nestiepTs.classifyDocumentLocally;
}

async function extractWithHiveIntake(pdfPath) {
  const { extractDocument } = await import(
    pathToFileURL(join(repoRoot, "packages/intake/src/extract-document.ts")).href
  );
  const bytes = readFileSync(pdfPath);
  const result = await extractDocument({
    documentId: basename(pdfPath),
    bytes,
    mimeType: "application/pdf",
    sourceHash: "parity",
    runId: "parity",
  });
  return result.normalizedExtraction;
}

function scanDocFromNormalized(normalized, filename, id) {
  return hiveAdapter.iepScanDocumentFromNormalized({
    sourceDocumentId: id,
    filename,
    mimeType: normalized.mimeType,
    normalized,
  });
}

function toScanDocumentNest(normalized, filename, id) {
  return {
    scanDocumentId: id,
    originalDisplayName: filename,
    mimeType: "application/pdf",
    pageCount: normalized.pages.length,
    pages: normalized.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.canonicalText })),
    readStatus: "ok",
  };
}

async function main() {
  if (!existsSync(corpusDir)) {
    console.error(`L001 corpus not found at ${corpusDir}`);
    process.exit(1);
  }
  const classifyNest = await loadNestiepClassifier();
  const pdfs = readdirSync(corpusDir).filter((name) => name.toLowerCase().endsWith(".pdf"));
  const rows = [];

  for (const name of pdfs) {
    const path = join(corpusDir, name);
    const normalized = await extractWithHiveIntake(path);
    if (!normalized) {
      rows.push({ source: name, error: "extraction_failed" });
      continue;
    }
    const id = name.replace(/\.pdf$/i, "");
    const nestDoc = toScanDocumentNest(normalized, name, id);
    const hiveDoc = scanDocFromNormalized(normalized, name, id);
    const nest = classifyNest(nestDoc);
    const hive = hiveClassify.classifyIepDocumentLocally(hiveDoc);
    rows.push({
      source: name,
      pageRange: "1-" + normalized.pages.length,
      nestFamily: nest.family,
      hiveFamily: hive.family === "OTHER" ? "OTHER_EDUCATIONAL" : hive.family,
      nestSubtype: nest.subtype,
      hiveSubtype: hive.subtype,
      nestConfidence: nest.confidence,
      hiveConfidence: hive.confidence,
      match:
        nest.family === hive.family &&
        (nest.subtype ?? null) === (hive.subtype ?? null),
      note:
        nest.family === hive.family && (nest.subtype ?? null) === (hive.subtype ?? null)
          ? ""
          : "compare classificationReason / title extraction",
    });
  }

  const reportPath = join(repoRoot, "domain-packs/iep/artifacts/l001-parity-report.json");
  writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
  console.log(`Wrote ${reportPath}`);
  console.table(
    rows.map((r) => ({
      source: r.source,
      match: r.match,
      nest: `${r.nestFamily}/${r.nestSubtype ?? "—"}`,
      hive: `${r.hiveFamily}/${r.hiveSubtype ?? "—"}`,
    })),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
