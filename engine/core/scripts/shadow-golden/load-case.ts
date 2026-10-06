import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { extractDocument } from "@hiveforyou/intake";
import { recoverNormalizedDocument } from "@hiveforyou/intake/server-extraction";

import type { DocumentPages } from "../../src/document/page-model.ts";
import type { V4AcceptedClaim } from "../../src/study/shadow/compare-v4.ts";
import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";

import { ensureDocumentPagesSnapshot } from "./ensure-document-pages.ts";
import { corpusDirForCase, goldenDirForCase } from "./paths.ts";

export type ShadowCaseId = "l001" | "caleb9";

export type CaseManifestFile = {
  filename: string;
  sha256: string;
};

export type CaseManifest = {
  files: CaseManifestFile[];
  sourceIdPrefix?: string;
};

export type LoadedCaseDocument = {
  filename: string;
  sha256: string;
  sourceId: string;
  pages: DocumentPages;
  recoveredPages: NestIepRecoveredPage[];
};

export type LoadedShadowCase = {
  caseId: ShadowCaseId;
  corpusDir: string;
  goldenDir: string;
  documents: LoadedCaseDocument[];
  sourceIdToDocumentId: Map<string, string>;
  v4Claims: V4AcceptedClaim[];
};

async function buildIntakeExtractDeps() {
  const { createCanvasPageRasterizer } = await import("@hiveforyou/intake-node/canvas-rasterize");
  return {
    recover: recoverNormalizedDocument,
    resolvePageRasterizer: async () => createCanvasPageRasterizer(),
  };
}

function readManifest(corpusDir: string): CaseManifest | null {
  const manifestPath = join(corpusDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return null;
  }
  return JSON.parse(readFileSync(manifestPath, "utf8")) as CaseManifest;
}

function listPdfFiles(corpusDir: string): string[] {
  return readdirSync(corpusDir)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort();
}

function loadV4Claims(goldenDir: string): V4AcceptedClaim[] {
  const path = join(goldenDir, "v4-claims.json");
  if (!existsSync(path)) {
    throw new Error(`MISSING_V4_CLAIMS:${path}`);
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    claims: V4AcceptedClaim[];
    totalClaims?: number;
  };
  if (!Array.isArray(raw.claims)) {
    throw new Error(`V4_CLAIMS_INVALID:${path}`);
  }
  if (typeof raw.totalClaims === "number" && raw.totalClaims !== raw.claims.length) {
    throw new Error(
      `V4_CLAIMS_COUNT_MISMATCH:expected=${raw.totalClaims}:actual=${raw.claims.length}`,
    );
  }
  return raw.claims;
}

export async function loadShadowCase(caseId: ShadowCaseId): Promise<LoadedShadowCase> {
  const corpusDir = corpusDirForCase(caseId);
  const goldenDir = goldenDirForCase(caseId);
  const manifest = readManifest(corpusDir);
  const pdfFiles = manifest?.files?.map((f) => f.filename) ?? listPdfFiles(corpusDir);
  const sourcePrefix = manifest?.sourceIdPrefix ?? `${caseId}-src`;
  const sourceIdToDocumentId = new Map<string, string>();
  const documents: LoadedCaseDocument[] = [];
  const deps = await buildIntakeExtractDeps();

  for (let index = 0; index < pdfFiles.length; index += 1) {
    const pdf = pdfFiles[index]!;
    const sourceId = `${sourcePrefix}-${index + 1}`;
    sourceIdToDocumentId.set(sourceId, pdf);

    const bytes = readFileSync(join(corpusDir, pdf));
    const computedSha = createHash("sha256").update(bytes).digest("hex");
    const manifestSha = manifest?.files.find((f) => f.filename === pdf)?.sha256;
    if (manifestSha && manifestSha !== computedSha) {
      throw new Error(`MANIFEST_SHA_MISMATCH:${pdf}`);
    }
    const sha256 = manifestSha ?? computedSha;

    const { pages } = await ensureDocumentPagesSnapshot({
      corpusDir,
      pdfFilename: pdf,
      sha256,
    });

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

    documents.push({
      filename: pdf,
      sha256,
      sourceId,
      pages,
      recoveredPages: normalized.pages,
    });
  }

  return {
    caseId,
    corpusDir,
    goldenDir,
    documents,
    sourceIdToDocumentId,
    v4Claims: loadV4Claims(goldenDir),
  };
}
