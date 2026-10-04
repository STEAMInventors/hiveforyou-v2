import fs from "node:fs";
import path from "node:path";

const files = [
  "engine/intake/src/extract-document.ts",
  "engine/intake/src/server-extraction.ts",
  "engine/intake/src/extraction/methods.ts",
  "engine/intake/src/extraction/map-normalized-to-intake.ts",
  "engine/intake/src/extraction/pdfjs-worker.ts",
  "engine/intake/src/extraction/nestiep/recover-document.ts",
  "engine/intake/src/extraction/nestiep/handlers.ts",
  "engine/intake/src/extraction/nestiep/pdfHandler.ts",
  "engine/intake/src/extraction/nestiep/imageHandler.ts",
  "engine/intake/src/extraction/nestiep/ocrEngine.ts",
  "engine/intake/src/extraction/nestiep/detectFileType.ts",
  "engine/intake/src/extraction/nestiep/buildRecoveredPage.ts",
  "engine/intake/src/extraction/nestiep/qualityGate.ts",
  "engine/intake/src/extraction/nestiep/canonicalize.ts",
  "engine/intake/src/extraction/nestiep/contracts.ts",
  "engine/intake/src/extraction/nestiep/recovery-context.ts",
  "engine/intake/src/extraction/nestiep/pdf-open-error.ts",
  "engine/intake/src/extraction/nestiep/rasterize-types.ts",
  "engine/intake-node/src/canvas-rasterize.ts",
  "engine/intake-node/src/guten-ocr.ts",
  "engine/intake-node/src/index.ts",
  "app/src/lib/intake/intake-service-server.ts",
  "app/src/lib/evidence/pdf-document-client.ts",
];

const intro = `# Document text extraction (code reference)

Snapshot of intake PDF / image / plain-text extraction and browser PDF rendering. Live source: \`engine/intake\`, \`engine/intake-node\`, app wiring in \`app/src/lib/intake/intake-service-server.ts\`.

## Pipeline

1. **\`extractDocument\`** (\`engine/intake/src/extract-document.ts\`) — intake entry point.
2. **\`recoverNormalizedDocument\`** — magic-byte detection; \`text/plain\` UTF-8; else PDF or JPEG/PNG handlers.
3. **PDF** — pdfjs legacy \`getTextContent\`; per-page quality gate; if OCR needed, rasterize (canvas) + \`OcrEngine.recognizePage\`.
4. **Image** — OCR only.
5. **\`buildRecoveredPage\` + \`canonicalize\`** — lines, offsets, \`canonicalText\`.
6. **\`normalizedToExtractionPages\` + \`assessExtraction\`** — flat pages + \`SUCCEEDED\` / \`NEEDS_OCR\` / \`FAILED\`.

**App wiring:** \`intake-service-server.ts\` passes \`resolvePageRasterizer\` from \`@hiveforyou/intake-node\`; \`resolveOcrEngine\` is not wired in production yet (tests may pass \`ocrEngine: null\` or inject an engine).

**Browser (Evidence UI):** \`pdf-document-client.ts\` loads \`/pdf.min.mjs\` for preview — not used for intake text extraction.

---

`;

let body = "";
for (const f of files) {
  if (!fs.existsSync(f)) {
    continue;
  }
  body += `## \`${f}\`\n\n\`\`\`typescript\n${fs.readFileSync(f, "utf8").trimEnd()}\n\`\`\`\n\n`;
}

const out = "brain/architecture/document-text-extraction.md";
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, intro + body);
console.log(`wrote ${out} (${fs.statSync(out).size} bytes)`);
