import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compilePackDrivenReaderPrompt,
  renderPackDrivenReaderPreviewReport,
  type ProposalDomainPack,
} from "../src/pack-driven-reader/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const packPath = join(repoRoot, "brain/domain-packs/iep/iep-pack.v0.3.proposed.json");
const outDir = join(repoRoot, "engine/domain-pack/fixtures/pack-driven-reader-preview");

const pack = JSON.parse(readFileSync(packPath, "utf8")) as ProposalDomainPack;

const manifest = [
  {
    sourceDocumentId: "00000000-0000-4000-8000-000000000001",
    filename: "sample-plan.pdf",
    pageCount: 2,
    documentTypeId: "iep.plan",
  },
  {
    sourceDocumentId: "00000000-0000-4000-8000-000000000002",
    filename: "sample-progress.pdf",
    pageCount: 1,
    documentTypeId: "iep.progress",
  },
];

const samplePage = (label: string) => ({
  pageNumber: 1,
  text: `[Synthetic offline preview page for ${label} — no family document text.]`,
});

const previewDocuments = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000099",
] as const;

mkdirSync(outDir, { recursive: true });

const report = renderPackDrivenReaderPreviewReport({
  pack,
  caseManifest: manifest,
  documents: previewDocuments.map((sourceDocumentId) => ({
    sourceDocumentId,
    samplePages: [samplePage(sourceDocumentId)],
  })),
});

writeFileSync(join(outDir, "iep-v0.3-preview-report.md"), report, "utf8");

for (const sourceDocumentId of previewDocuments) {
  const compiled = compilePackDrivenReaderPrompt({
    pack,
    caseManifest: manifest,
    document: {
      sourceDocumentId,
      pages: [samplePage(sourceDocumentId)],
    },
  });
  writeFileSync(
    join(outDir, `${sourceDocumentId}.prompt.json`),
    JSON.stringify(
      {
        sourceDocumentId,
        packDocumentTypeCount: compiled.packDocumentTypeCount,
        packRecordTypeCount: compiled.packRecordTypeCount,
        stableSystemPrefix: compiled.stableSystemPrefix,
        caseUserContent: compiled.caseUserContent,
        outputJsonSchema: compiled.outputJsonSchema,
      },
      null,
      2,
    ),
    "utf8",
  );
}

console.log(`Wrote preview artifacts to ${outDir}`);
