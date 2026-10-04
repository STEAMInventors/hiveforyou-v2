import type { OcrImage } from "./ocrEngine";

export interface PageRasterizer {
  rasterizePdfPage(page: PdfPageProxy): Promise<OcrImage>;
}

export interface PdfPageProxy {
  getViewport(params: { scale: number }): { width: number; height: number };
  render(params: {
    canvasContext: unknown;
    canvas: unknown;
    viewport: { width: number; height: number };
  }): { promise: Promise<void> };
}
