const PLAIN_TEXT_MIMES = new Set(["text/plain", "text/markdown", "text/csv"]);

export function baseMime(mimeType: string | null | undefined): string {
  const raw = (mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return raw;
}

export function isPlainTextMime(mimeType: string | null | undefined): boolean {
  return PLAIN_TEXT_MIMES.has(baseMime(mimeType));
}

export function decodePlainTextBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le", { fatal: false }).decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be", { fatal: false }).decode(bytes.subarray(2));
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}
