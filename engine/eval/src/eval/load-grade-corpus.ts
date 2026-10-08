import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { PageModel } from "@hiveforyou/core/document/page-model";
import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";

import type { GradeCorpusContext } from "../grade.js";
import { baselineManifestDirForGolden } from "./baseline-case-id.js";

export type CorpusManifestFile = {
  filename: string;
  sha256: string;
  sourceDocumentId?: string;
};

export type CorpusManifest = {
  files: CorpusManifestFile[];
  sourceIdPrefix?: string;
};

type DocumentPagesSnapshot = {
  documentPages: { pages: PageModel[] };
};

function readManifest(corpusDir: string): CorpusManifest | null {
  const path = join(corpusDir, "manifest.json");
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8")) as CorpusManifest;
}

function readPageModels(corpusDir: string, pdfFilename: string): PageModel[] {
  const snapshotPath = join(corpusDir, "document-pages", pdfFilename.replace(/\.pdf$/i, ".json"));
  if (!existsSync(snapshotPath)) {
    throw new Error(`Missing document-pages snapshot: ${snapshotPath}`);
  }
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as DocumentPagesSnapshot;
  return snapshot.documentPages.pages;
}

/** Minimal recovered page: grader falls back to full PageModel words when line locators miss. */
export function minimalRecoveredPage(page: PageModel, sourceDocumentId: string): NestIepRecoveredPage {
  return {
    runId: "eval-corpus",
    sourceDocumentId,
    pageNumber: page.pageNumber,
    extractionMethod: "NATIVE",
    canonicalText: page.words.map((w) => w.text).join(" "),
    lines: [],
    blocks: [],
    sourceIssues: [],
  };
}

/** Map baseline sourceDocumentId (e.g. production UUID) to golden corpus pdf filename. */
export function sourceIdToPdfFilename(input: {
  baselineManifest: CorpusManifest | null;
  corpusManifest: CorpusManifest | null;
  baselineCaseId: string;
  corpusCaseId: string;
}): Map<string, string> {
  const map = new Map<string, string>();
  const corpusFiles = input.corpusManifest?.files ?? [];
  const baselineFiles = input.baselineManifest?.files ?? [];

  if (baselineFiles.length > 0) {
    baselineFiles.forEach((bFile, index) => {
      const sourceId = bFile.sourceDocumentId ?? `${input.baselineCaseId}-src-${index + 1}`;
      const corpusFile =
        corpusFiles.find((f) => f.filename === bFile.filename) ?? corpusFiles[index];
      if (corpusFile) {
        map.set(sourceId, corpusFile.filename);
      }
    });
    return map;
  }

  const prefix = input.corpusManifest?.sourceIdPrefix ?? "-src";
  corpusFiles.forEach((file, index) => {
    const sourceId = file.sourceDocumentId ?? `${input.corpusCaseId}${prefix}-${index + 1}`;
    map.set(sourceId, file.filename);
  });
  return map;
}

export async function loadGradeCorpusForGolden(input: {
  repoRoot: string;
  goldenCaseId: string;
  corpusDirRel: string;
}): Promise<GradeCorpusContext> {
  const corpusDir = join(input.repoRoot, input.corpusDirRel);
  const corpusManifest = readManifest(corpusDir);
  const baselineCaseId = baselineManifestDirForGolden(input.goldenCaseId);
  const baselineManifest = readManifest(join(input.repoRoot, "engine/intake/fixtures", baselineCaseId));

  const sourceDocumentIdToDocumentId = sourceIdToPdfFilename({
    baselineManifest,
    corpusManifest,
    baselineCaseId,
    corpusCaseId: input.goldenCaseId,
  });

  const files = corpusManifest?.files ?? [];
  if (files.length === 0) {
    throw new Error(`No manifest.json or empty files in ${input.corpusDirRel}`);
  }

  const pageModelsByDocumentId = new Map<string, PageModel[]>();
  const recoveredPagesByDocumentId = new Map<string, NestIepRecoveredPage[]>();

  for (const file of files) {
    const pages = readPageModels(corpusDir, file.filename);
    pageModelsByDocumentId.set(file.filename, pages);
    const sourceId = file.sourceDocumentId ?? file.filename;
    recoveredPagesByDocumentId.set(
      file.filename,
      pages.map((p) => minimalRecoveredPage(p, sourceId)),
    );
  }

  return {
    pageModelsByDocumentId,
    recoveredPagesByDocumentId,
    sourceDocumentIdToDocumentId,
  };
}
