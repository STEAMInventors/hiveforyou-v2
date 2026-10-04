"use client";

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
};

type PdfViewport = { width: number; height: number };

type PdfPageProxy = {
  getViewport: (params: { scale: number }) => PdfViewport;
  render: (params: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => { promise: Promise<void>; cancel?: () => void };
};

type PdfJsModule = {
  getDocument: (params: {
    data: Uint8Array;
    useSystemFonts?: boolean;
  }) => { promise: Promise<PdfDocumentProxy> };
  GlobalWorkerOptions: { workerSrc: string };
};

let pdfjsPromise: Promise<PdfJsModule> | null = null;

const documentCache = new Map<string, Promise<PdfDocumentProxy>>();

/** Served from public/ (sync-pdf-worker.mjs). Must not import pdfjs-dist via Webpack — it breaks at runtime. */
const PUBLIC_PDF_MODULE = "/pdf.min.mjs";
const PUBLIC_PDF_WORKER = "/pdf.worker.min.mjs";

async function importPdfJs(): Promise<PdfJsModule> {
  if (typeof window === "undefined") {
    throw new Error("PDF.js is only available in the browser");
  }
  const moduleUrl = new URL(PUBLIC_PDF_MODULE, window.location.origin).href;
  const loaded = await import(/* webpackIgnore: true */ moduleUrl);
  const record = loaded as Record<string, unknown> & { default?: PdfJsModule };
  const pdfjs =
    record.getDocument && typeof record.getDocument === "function"
      ? (record as PdfJsModule)
      : record.default && typeof record.default.getDocument === "function"
        ? record.default
        : null;
  if (!pdfjs) {
    throw new Error("PDF.js module did not export getDocument");
  }
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(PUBLIC_PDF_WORKER, window.location.origin).href;
  return pdfjs;
}

export function isPdfRenderCancelled(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "RenderingCancelledException" ||
    /cancel/i.test(error.message) ||
    /abort/i.test(error.message)
  );
}

export async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = importPdfJs();
  }
  return pdfjsPromise;
}

async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { credentials: "include" });

  if (!response.ok) {
    throw new Error(`PDF request failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    throw new Error("PDF request returned JSON (auth or not found)");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length >= 4) {
    const header = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
    if (header !== "%PDF") {
      throw new Error("Response is not a PDF file");
    }
  }

  return bytes;
}

async function loadPdfDocumentUncached(url: string): Promise<PdfDocumentProxy> {
  const pdfjs = await loadPdfJs();
  const data = await fetchPdfBytes(url);

  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  return task.promise;
}

export async function loadPdfDocument(url: string): Promise<PdfDocumentProxy> {
  let pending = documentCache.get(url);

  if (!pending) {
    pending = loadPdfDocumentUncached(url).catch((error) => {
      documentCache.delete(url);
      throw error;
    });

    documentCache.set(url, pending);
  }

  return pending;
}

export async function renderPdfPageToCanvas(input: {
  page: PdfPageProxy;
  canvas: HTMLCanvasElement;
  scale: number;
}): Promise<{ width: number; height: number }> {
  const viewport = input.page.getViewport({ scale: input.scale });
  const context = input.canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2d context unavailable");
  }

  input.canvas.width = Math.floor(viewport.width);
  input.canvas.height = Math.floor(viewport.height);

  const renderTask = input.page.render({
    canvas: input.canvas,
    canvasContext: context,
    viewport,
  });

  await renderTask.promise;

  return { width: viewport.width, height: viewport.height };
}

export type { PdfDocumentProxy, PdfPageProxy };
