import {
  INTAKE_IDENTITY_CONFIG_ID,
  type DocumentIdentityType,
} from "@hiveforyou/shared/intake";

import type { JevIdentityDecision } from "./jev-client";

export type LocalDocumentClassifierInput = {
  scanDocumentId: string;
  originalDisplayName: string;
  mimeType: string;
  pageCount: number;
  pages: { pageNumber: number; text: string }[];
  readStatus: "ok";
};

export type LocalDocumentClassifierResult = {
  family: string;
  confidence: number;
};

export type LocalDocumentClassifier = (
  input: LocalDocumentClassifierInput,
) => LocalDocumentClassifierResult;

export type DecideIntakeDocumentIdentityOptions = {
  classifyLocally: LocalDocumentClassifier;
};

function keywordIdentity(sample: string): DocumentIdentityType | null {
  const text = sample.toLowerCase();
  if (
    /\b(medicaid|notice of action|denial letter|42 cfr §431)\b/i.test(sample) ||
    text.includes("medicaid")
  ) {
    return "medicaid_document";
  }
  if (/\b(bankruptcy|schedule [a-j]|creditor matrix)\b/i.test(text)) {
    return "bankruptcy_filing";
  }
  if (/\bbank statement\b|\baccount summary\b/i.test(text)) {
    return "bank_statement";
  }
  return null;
}

export async function decideIntakeDocumentIdentity(
  sample: string,
  { classifyLocally }: DecideIntakeDocumentIdentityOptions,
): Promise<JevIdentityDecision> {
  const keyword = keywordIdentity(sample);
  if (keyword) {
    return {
      choice: keyword,
      confidence: 0.85,
      returnedModel: "keyword-v1",
      classifierVersion: INTAKE_IDENTITY_CONFIG_ID,
    };
  }

  const local = classifyLocally({
    scanDocumentId: "intake-sample",
    originalDisplayName: "",
    mimeType: "application/pdf",
    pageCount: 1,
    pages: [{ pageNumber: 1, text: sample }],
    readStatus: "ok",
  });
  const choice: DocumentIdentityType =
    local.family === "OTHER" || local.family === "OTHER_EDUCATIONAL" ? "other" : "iep_document";
  return {
    choice,
    confidence: Math.max(0.75, local.confidence),
    returnedModel: "iep-classify-local",
    classifierVersion: INTAKE_IDENTITY_CONFIG_ID,
  };
}
