import { createCanvas } from "@napi-rs/canvas";

import type { PageRasterizer, PdfPageProxy } from "@hiveforyou/intake/nestiep-rasterize-types";

interface MutableCanvas {
  width: number;
  height: number;
  getContext: (id: "2d") => unknown;
  toBuffer: (mime: "image/png") => Buffer;
}

/** PDF page rasterizer for NestIEP OCR fallback (native addons live in this package, not `@hiveforyou/intake`). */
export function createCanvasPageRasterizer(): PageRasterizer {
  return {
    async rasterizePdfPage(page: PdfPageProxy) {
      const viewport = page.getViewport({ scale: 2 });
      const width = Math.max(1, Math.ceil(viewport.width));
      const height = Math.max(1, Math.ceil(viewport.height));
      const canvas = createCanvas(width, height) as unknown as MutableCanvas;
      const canvasContext = canvas.getContext("2d");
      await page.render({
        canvasContext: canvasContext as never,
        canvas: canvas as never,
        viewport,
      }).promise;
      return {
        bytes: new Uint8Array(canvas.toBuffer("image/png")),
        width,
        height,
        mimeType: "image/png" as const,
      };
    },
  };
}
