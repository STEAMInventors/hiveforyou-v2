import type { SupportedFileKind } from "./contracts";

export interface DetectedFileType {
  readonly kind: SupportedFileKind | "unknown";
  readonly mimeType: string;
}

const PDF_MAGIC = Buffer.from("%PDF");
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function detectFileType(bytes: Uint8Array, suppliedMimeType: string): DetectedFileType {
  if (startsWith(bytes, PDF_MAGIC)) {
    return { kind: "pdf", mimeType: "application/pdf" };
  }
  if (startsWith(bytes, JPEG_MAGIC)) {
    return { kind: "jpeg", mimeType: "image/jpeg" };
  }
  if (startsWith(bytes, PNG_MAGIC)) {
    return { kind: "png", mimeType: "image/png" };
  }
  return {
    kind: "unknown",
    mimeType: suppliedMimeType,
  };
}

export function suppliedMimeAgrees(detected: DetectedFileType, suppliedMimeType: string): boolean {
  const supplied = suppliedMimeType.toLowerCase();
  if (detected.kind === "pdf") {
    return supplied === "application/pdf" || supplied === "application/x-pdf";
  }
  if (detected.kind === "jpeg") {
    return supplied === "image/jpeg" || supplied === "image/jpg";
  }
  if (detected.kind === "png") {
    return supplied === "image/png";
  }
  return false;
}

function startsWith(bytes: Uint8Array, magic: Uint8Array): boolean {
  if (bytes.length < magic.length) {
    return false;
  }
  for (let i = 0; i < magic.length; i += 1) {
    if (bytes[i] !== magic[i]) {
      return false;
    }
  }
  return true;
}
