import type { BBox, DocumentPages, PageModel, PageWord } from "@hiveforyou/core/document/page-model";

import { loadPdfJsWithOps } from "./pdfjs-worker";

type PdfDocumentProxy = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
  destroy(): Promise<void>;
};

type PdfPageProxy = {
  getTextContent(): Promise<{ items: readonly unknown[] }>;
  getViewport(params: { scale: number; rotation?: number }): {
    width: number;
    height: number;
    transform: number[];
  };
  rotate: number;
  cleanup(): Promise<void>;
};

type TextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
};

function normalizeRotation(rotate: number): 0 | 90 | 180 | 270 {
  const r = ((rotate % 360) + 360) % 360;
  if (r === 90) {
    return 90;
  }
  if (r === 180) {
    return 180;
  }
  if (r === 270) {
    return 270;
  }
  return 0;
}

function transformPoint(matrix: number[], x: number, y: number): [number, number] {
  return [
    matrix[0]! * x + matrix[2]! * y + matrix[4]!,
    matrix[1]! * x + matrix[3]! * y + matrix[5]!,
  ];
}

function fontStyleFromName(fontName: string | null): {
  bold: boolean | null;
  italic: boolean | null;
} {
  if (!fontName) {
    return { bold: null, italic: null };
  }
  const bold =
    /Bold|Black|Heavy/.test(fontName) ? true : null;
  const italic =
    /Italic|-It|Oblique/.test(fontName) ? true : null;
  return { bold, italic: italic ?? null };
}

function charIsGarbage(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  return cp === 0xfffd || (cp < 32 && cp !== 9 && cp !== 10 && cp !== 13);
}

function pageGarbageRatio(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  let garbage = 0;
  for (const ch of text) {
    if (charIsGarbage(ch)) {
      garbage += 1;
    }
  }
  const cidMatches = text.match(/\(cid:\d+\)/g);
  if (cidMatches) {
    for (const match of cidMatches) {
      garbage += match.length;
    }
  }
  return garbage / text.length;
}

function itemToTopLeftBox(item: TextItem, viewportTransform: number[]): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const m = item.transform;
  const fontHeight = Math.hypot(m[2] ?? 0, m[3] ?? 0) || item.height || 12;
  const [vx, vy] = transformPoint(viewportTransform, m[4] ?? 0, m[5] ?? 0);
  const [vx2] = transformPoint(viewportTransform, (m[4] ?? 0) + item.width, m[5] ?? 0);
  const width = Math.abs(vx2 - vx) || item.width;
  const top = vy - fontHeight;
  return { left: vx, top, width, height: fontHeight };
}

function splitItemIntoWords(
  item: TextItem,
  viewportTransform: number[],
  seqStart: number,
): PageWord[] {
  const raw = item.str;
  if (raw.trim().length === 0) {
    return [];
  }
  const tokens = raw.split(/\s+/).filter((part) => part.length > 0);
  if (tokens.length === 0) {
    return [];
  }
  const box = itemToTopLeftBox(item, viewportTransform);
  const totalChars = tokens.reduce((sum, token) => sum + token.length, 0);
  const { bold, italic } = fontStyleFromName(item.fontName ?? null);
  const fontSize = Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? 0) || null;

  const words: PageWord[] = [];
  let charOffset = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    const startFrac = totalChars > 0 ? charOffset / totalChars : 0;
    const endFrac = totalChars > 0 ? (charOffset + token.length) / totalChars : 1;
    charOffset += token.length;
    // Horizontal word positions within the pdf.js item are proportional to character count (approximation).
    const x0 = box.left + box.width * startFrac;
    const x1 = box.left + box.width * endFrac;
    const bbox: BBox = [x0, box.top, x1, box.top + box.height];
    words.push({
      seq: seqStart + i,
      text: token,
      bbox,
      confidence: null,
      fontName: item.fontName ?? null,
      fontSize,
      bold,
      italic,
      source: "native",
    });
  }
  return words;
}

function parseTextItem(raw: unknown): TextItem | null {
  if (!raw || typeof raw !== "object" || !("str" in raw) || typeof raw.str !== "string") {
    return null;
  }
  if (raw.str.length === 0) {
    return null;
  }
  const transform =
    "transform" in raw && Array.isArray(raw.transform) && raw.transform.length >= 6
      ? (raw.transform as number[])
      : null;
  if (!transform) {
    return null;
  }
  const width = "width" in raw && typeof raw.width === "number" ? raw.width : 0;
  const height = "height" in raw && typeof raw.height === "number" ? raw.height : 0;
  const fontName =
    "fontName" in raw && typeof raw.fontName === "string" ? raw.fontName : undefined;
  return { str: raw.str, transform, width, height, fontName };
}

async function loadPdfDocument(bytes: Uint8Array): Promise<{
  document: PdfDocumentProxy;
  loadingTask: { destroy(): Promise<void> };
}> {
  const { getDocument } = await loadPdfJsWithOps();
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);
  const loadingTask = getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
    useWasm: false,
    verbosity: 0,
  }) as { promise: Promise<PdfDocumentProxy>; destroy(): Promise<void> };
  const document = await loadingTask.promise;
  return { document, loadingTask };
}

async function extractPageWords(page: PdfPageProxy, documentId: string, pageNumber: number): Promise<PageModel> {
  const rotation = normalizeRotation(page.rotate ?? 0);
  const viewport = page.getViewport({ scale: 1, rotation });
  const content = await page.getTextContent();
  const words: PageWord[] = [];
  let seq = 0;
  for (const raw of content.items) {
    const item = parseTextItem(raw);
    if (!item) {
      continue;
    }
    const itemWords = splitItemIntoWords(item, viewport.transform, seq);
    seq += itemWords.length;
    words.push(...itemWords);
  }
  const pageText = words.map((w) => w.text).join(" ");
  return {
    documentId,
    pageNumber,
    width: viewport.width,
    height: viewport.height,
    rotation,
    route: "native",
    imageRef: null,
    words,
    quality: {
      textCoverage: null,
      meanConfidence: null,
      garbageRatio: pageGarbageRatio(pageText),
      illegibleRegions: [],
    },
  };
}

export async function buildDocumentPagesFromPdfDocument(
  document: PdfDocumentProxy,
  input: { documentId: string; sha256: string },
): Promise<DocumentPages> {
  const pages: PageModel[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    try {
      pages.push(await extractPageWords(page, input.documentId, pageNumber));
    } finally {
      try {
        await page.cleanup();
      } catch {
        // Best-effort cleanup.
      }
    }
  }
  return {
    documentId: input.documentId,
    sha256: input.sha256,
    pages,
    formFields: [],
  };
}

export async function extractNativeWords(
  pdfBytes: Uint8Array,
  input: { documentId: string; sha256: string },
): Promise<DocumentPages> {
  const loaded = await loadPdfDocument(pdfBytes);
  try {
    return await buildDocumentPagesFromPdfDocument(loaded.document, input);
  } finally {
    try {
      await loaded.document.destroy();
    } catch {
      // Best-effort cleanup.
    }
    try {
      await loaded.loadingTask.destroy();
    } catch {
      // Best-effort worker shutdown.
    }
  }
}

/** Raw pdf.js item strings split on whitespace (for split-lossless tests). */
export async function rawPdfJsWhitespaceTokens(pdfBytes: Uint8Array, pageNumber: number): Promise<string[]> {
  const loaded = await loadPdfDocument(pdfBytes);
  try {
    const page = await loaded.document.getPage(pageNumber);
    try {
      const content = await page.getTextContent();
      const tokens: string[] = [];
      for (const raw of content.items) {
        const item = parseTextItem(raw);
        if (!item) {
          continue;
        }
        tokens.push(...item.str.split(/\s+/).filter((part) => part.length > 0));
      }
      return tokens;
    } finally {
      await page.cleanup();
    }
  } finally {
    await loaded.document.destroy();
    await loaded.loadingTask.destroy();
  }
}
