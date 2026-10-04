/** Server-side extraction surface (no native Node addons in this entry). */
export type { PageRasterizer, PdfPageProxy } from "./extraction/nestiep/rasterize-types";
export type { OcrEngine, OcrImage, OcrPageResult } from "./extraction/nestiep/ocrEngine";
export {
  recoverNormalizedDocument,
  type RecoverDocumentInput,
} from "./extraction/nestiep/recover-document";
