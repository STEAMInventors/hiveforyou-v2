export type BBox = [x0: number, y0: number, x1: number, y1: number]; // PDF points, origin top-left, page rotation already applied

export type WordSource = "native" | "ocr" | "form" | "vision";

export interface PageWord {
  seq: number;
  text: string;
  bbox: BBox;
  confidence: number | null;
  fontName: string | null;
  fontSize: number | null;
  bold: boolean | null;
  italic: boolean | null;
  source: WordSource;
}

export type PageRoute = "native" | "native+ocr_regions" | "ocr" | "ocr+vision";

export interface PageQuality {
  textCoverage: number | null;
  meanConfidence: number | null;
  garbageRatio: number;
  illegibleRegions: BBox[];
}

export interface PageModel {
  documentId: string;
  pageNumber: number;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  route: PageRoute;
  imageRef: string | null;
  words: PageWord[];
  quality: PageQuality;
}

export interface DocumentPages {
  documentId: string;
  sha256: string;
  pages: PageModel[];
  formFields: FormFieldValue[];
}

export interface FormFieldValue {
  pageNumber: number;
  name: string;
  kind: "text" | "checkbox" | "radio" | "choice" | "signature" | "unknown";
  value: string | null;
  checked: boolean | null;
  bbox: BBox;
}
