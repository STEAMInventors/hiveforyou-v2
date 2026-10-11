import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { DocumentPages, PageModel } from "@hiveforyou/core/document/page-model";
import { loadGradeCorpusForGolden } from "../../../engine/eval/src/eval/load-grade-corpus.js";
import type { GradeCorpusContext } from "../../../engine/eval/src/index.js";
import type { GoldenCase } from "../../../engine/eval/src/index.js";
import { bindDocumentPagesToSourceDocumentId } from "../../../worker/src/study/trusted-document-pages-shared.js";

export type L001DocumentBundle = {
  filename: string;
  sourceDocumentId: string;
  documentTypeId: string;
  documentPages: DocumentPages;
};

/** IEP Pack v0.3 document type ids for the eight-document L001 qualification corpus. */
export const L001_PACK_DOCUMENT_TYPE_IDS: Record<string, string> = {
  "01_initial_referral.pdf": "iep.referral",
  "02_evaluation_plan.pdf": "iep.evaluation.plan",
  "03_parent_evaluation_consent.pdf": "iep.consent",
  "04_psychoeducational_evaluation.pdf": "iep.evaluation.psychoeducational",
  "05_academic_evaluation.pdf": "iep.evaluation.academic",
  "06_speech_language_evaluation.pdf": "iep.evaluation.speech_language",
  "07_eligibility_determination.pdf": "iep.eligibility",
  "08_initial_iep.pdf": "iep.plan",
};

type Manifest = {
  files: { filename: string; sourceDocumentId?: string }[];
};

function pagePlainText(page: PageModel): string {
  return page.words.map((w) => w.text).join(" ");
}

export function documentPagesToPackPages(documentPages: DocumentPages): { pageNumber: number; text: string }[] {
  return [...documentPages.pages]
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((page) => ({
      pageNumber: page.pageNumber,
      text: pagePlainText(page),
    }));
}

export async function loadL001PackDrivenCorpus(repoRoot: string): Promise<{
  golden: GoldenCase;
  gradeCorpus: GradeCorpusContext;
  bundles: L001DocumentBundle[];
}> {
  const goldenPath = join(repoRoot, "engine/eval/golden/tune/l001.json");
  const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as GoldenCase;
  const gradeCorpus = await loadGradeCorpusForGolden({
    repoRoot,
    goldenCaseId: golden.caseId,
    corpusDirRel: golden.corpusDir.replace(/^\//, ""),
  });

  const corpusDir = join(repoRoot, "engine/intake/fixtures/l001");
  const manifest = JSON.parse(readFileSync(join(corpusDir, "manifest.json"), "utf8")) as Manifest;
  const bundles: L001DocumentBundle[] = [];

  for (const file of manifest.files) {
    const documentTypeId = L001_PACK_DOCUMENT_TYPE_IDS[file.filename];
    if (!documentTypeId) {
      throw new Error(`L001_PACK_DOCUMENT_TYPE_MISSING:${file.filename}`);
    }
    const sourceDocumentId = file.sourceDocumentId ?? file.filename;
    const snapshotPath = join(
      corpusDir,
      "document-pages",
      file.filename.replace(/\.pdf$/i, ".json"),
    );
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
      documentPages: DocumentPages;
    };
    const documentPages = bindDocumentPagesToSourceDocumentId(
      snapshot.documentPages,
      sourceDocumentId,
    );
    bundles.push({
      filename: file.filename,
      sourceDocumentId,
      documentTypeId,
      documentPages,
    });
  }

  bundles.sort((a, b) => a.filename.localeCompare(b.filename));
  return { golden, gradeCorpus, bundles };
}
