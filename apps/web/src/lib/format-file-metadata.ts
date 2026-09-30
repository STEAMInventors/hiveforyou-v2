/** File metadata derived only from the File object — no Hive analysis. */

export function getFileExtensionLabel(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return "FILE";
  }
  return filename.slice(lastDot + 1).toUpperCase();
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function formatTotalSize(bytes: number): string {
  if (bytes === 0) {
    return "0 B total";
  }
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) {
    return `${Math.round(bytes / 1024)} KB total`;
  }
  return `${mb.toFixed(1)} MB total`;
}

export type FileIconKind = "pdf" | "image" | "generic";

export function getFileIconKind(filename: string): FileIconKind {
  const ext = getFileExtensionLabel(filename);
  if (ext === "PDF") {
    return "pdf";
  }
  if (["JPG", "JPEG", "PNG", "WEBP", "TIFF", "TIF"].includes(ext)) {
    return "image";
  }
  return "generic";
}
