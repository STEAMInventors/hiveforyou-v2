import type { NestIepBoundingBox as BoundingBox } from "@hiveforyou/shared/intake";

export interface OcrLine {
  readonly text: string;
  readonly boundingBox?: BoundingBox;
}

export interface OcrPageResult {
  readonly lines: readonly OcrLine[];
}

export interface OcrPageContext {
  readonly runId: string;
  readonly stepId: string;
  readonly sourceDocumentId: string;
  readonly pageNumber: number;
}

export interface OcrImage {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly mimeType: "image/png" | "image/jpeg";
}

/** Local OCR only. Implementations must not send page contents to a remote service. */
export interface OcrEngine {
  readonly adapterId: string;
  recognizePage(image: OcrImage, context: OcrPageContext): Promise<OcrPageResult>;
}
