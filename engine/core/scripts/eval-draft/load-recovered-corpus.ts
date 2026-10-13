/**
 * Load NestIEP recovered pages for eval golden drafting (same extraction path as shadow-golden load-case).
 * Lives in @hiveforyou/core so eval does not depend on @hiveforyou/intake.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { extractDocument } from "@hiveforyou/intake";
import { recoverNormalizedDocument } from "@hiveforyou/intake/server-extraction";
import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";

import { ensureDocumentPagesSnapshot } from "../shadow-golden/ensure-document-pages.ts";

export type CorpusManifestFile = {
  filename: string;
  sha256: string;
  sourceDocumentId?: string;
};

export type CorpusManifest = {
  files: CorpusManifestFile[];
  sourceIdPrefix?: string;
};

async function buildIntakeExtractDeps() {
  const { createCanvasPageRasterizer } = await import("@hiveforyou/intake-node/canvas-rasterize");
  return {
    recover: recoverNormalizedDocument,
    resolvePageRasterizer: async () => createCanvasPageRasterizer(),
  };
}

export async function loadRecoveredPagesByPdf(
  corpusDir: string,
  manifest: CorpusManifest | null,
): Promise<Map<string, NestIepRecoveredPage[]>> {
  const files =
    manifest?.files.map((f) => f.filename) ??
    readdirSync(corpusDir).filter((n) => n.toLowerCase().endsWith(".pdf"));

  const deps = await buildIntakeExtractDeps();
  const byDoc = new Map<string, NestIepRecoveredPage[]>();

  for (const pdf of files) {
    const bytes = readFileSync(join(corpusDir, pdf));
    const sha256 =
      manifest?.files.find((f) => f.filename === pdf)?.sha256 ??
      createHash("sha256").update(bytes).digest("hex");
    await ensureDocumentPagesSnapshot({ corpusDir, pdfFilename: pdf, sha256 });

    const extracted = await extractDocument(
      {
        runId: randomUUID(),
        documentId: pdf,
        mimeType: "application/pdf",
        bytes: new Uint8Array(bytes),
        sourceHash: sha256,
      },
      deps,
    );
    const normalized = extracted.normalizedExtraction;
    if (!normalized) {
      throw new Error(`EXTRACTION_FAILED:${pdf}`);
    }
    byDoc.set(pdf, normalized.pages);
  }

  return byDoc;
}
