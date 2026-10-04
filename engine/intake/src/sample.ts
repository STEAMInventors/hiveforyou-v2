import { IDENTITY_SAMPLE_CHARS, MIN_IDENTITY_TEXT_CHARS } from "@hiveforyou/shared/intake";

import type { ExtractionPage } from "./types";

export function normalizePageText(text: string): string {
  return text.normalize("NFC").replace(/\u0000/g, "").trim();
}

export function joinPageText(pages: Array<{ text: string }>): string {
  return pages.map((page) => normalizePageText(page.text)).filter((text) => text.length > 0).join("\n\n");
}

export function nonWhitespaceLength(text: string): number {
  return text.replace(/\s/g, "").length;
}

export function hasEnoughIdentityText(text: string): boolean {
  return nonWhitespaceLength(text) >= MIN_IDENTITY_TEXT_CHARS;
}

/** Bounded sample sent as Jev state. Callers must not prepend a filename. */
export function identityTextSample(text: string): string {
  return text.slice(0, IDENTITY_SAMPLE_CHARS);
}

export function normalizedPages(pages: ExtractionPage[]): ExtractionPage[] {
  return pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: normalizePageText(page.text),
    boundingBoxes: page.boundingBoxes ?? null,
  }));
}
