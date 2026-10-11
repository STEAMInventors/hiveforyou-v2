import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { DocumentPages } from "@hiveforyou/core/document/page-model";
import { loadGradeCorpusForGolden } from "../../../engine/eval/src/eval/load-grade-corpus.js";
import type { GradeCorpusContext } from "../../../engine/eval/src/index.js";
import type { GoldenCase } from "../../../engine/eval/src/index.js";

import { bindDocumentPagesToSourceDocumentId } from "../../../worker/src/study/trusted-document-pages-shared.js";

export type L001DocumentBundle = {
  filename: string;
  sourceDocumentId: string;
  documentType: string;
  documentPages: DocumentPages;
};

type Manifest = {
  files: { filename: string; sourceDocumentId?: string }[];
};

const L001_DOCUMENT_TYPES: Record<string, string> = {
  "01_initial_referral.pdf": "Referral for Special Education Evaluation",
  "02_evaluation_plan.pdf": "Special Education Evaluation Plan",
  "03_parent_evaluation_consent.pdf": "Parent Consent for Initial Special Education Evaluation",
  "04_psychoeducational_evaluation.pdf": "Psychoeducational evaluation",
  "05_academic_evaluation.pdf": "Academic Evaluation Report",
  "06_speech_language_evaluation.pdf": "Speech-language evaluation",
  "07_eligibility_determination.pdf": "Eligibility Determination",
  "08_initial_iep.pdf": "Individualized Education Program",
};

export async function loadL001ExperimentCorpus(repoRoot: string): Promise<{
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
      documentType: L001_DOCUMENT_TYPES[file.filename] ?? "Document",
      documentPages,
    });
  }

  bundles.sort((a, b) => a.filename.localeCompare(b.filename));
  return { golden, gradeCorpus, bundles };
}
