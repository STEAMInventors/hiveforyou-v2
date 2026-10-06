import type { BBox } from "../document/page-model";

export type Force =
  | "states"
  | "proposes"
  | "commits"
  | "requests"
  | "declines"
  | "agrees"
  | "observes"
  | "measures"
  | "occurred"
  | "selects"
  | "not_selected";

export interface EvidenceSpan {
  documentId: string;
  pageNumber: number;
  blockId: string;
  cellId: string | null;
  wordRange: [start: number, end: number];
  quote: string;
  bbox: BBox;
}

export interface Statement {
  id: string;
  documentId: string;
  tier: 0 | 1;
  subjectId: string;
  attributeRaw: string;
  attributeKey: string | null;
  valueRaw: string | null;
  valueNorm: string | number | boolean | null;
  unit: string | null;
  appliesFrom: string | null;
  appliesTo: string | null;
  conditionRaw: string | null;
  speakerId: string | null;
  sourceRefId: string | null;
  force: Force;
  isEmpty: boolean;
  evidence: EvidenceSpan[];
}

export interface Party {
  id: string;
  documentId: string;
  nameRaw: string;
  nameNorm: string;
  role: string | null;
  evidence: EvidenceSpan[];
}

export interface Thing {
  id: string;
  documentId: string;
  label: string;
  kind: string | null;
  evidence: EvidenceSpan[];
}

export interface Reference {
  id: string;
  documentId: string;
  targetDescription: string;
  evidence: EvidenceSpan[];
}

export interface Term {
  id: string;
  documentId: string;
  text: string;
  evidence: EvidenceSpan[];
}

export interface DocumentProfile {
  documentId: string;
  kind: string | null;
  purpose: string | null;
  issuedDate: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  authorId: string | null;
  requests: { text: string; evidence: EvidenceSpan[] }[];
}

export type PageWordRange = {
  documentId: string;
  pageNumber: number;
  wordStart: number;
  wordEnd: number;
};

export function wordRangesOverlap(
  a: PageWordRange,
  b: PageWordRange,
): boolean {
  if (a.documentId !== b.documentId || a.pageNumber !== b.pageNumber) {
    return false;
  }
  const aEnd = a.wordEnd;
  const bEnd = b.wordEnd;
  return a.wordStart < bEnd && b.wordStart < aEnd;
}
