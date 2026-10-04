/** Customer-facing physical file type from mime and filename only. */
export function physicalFileTypeLabel(mimeType: string | null | undefined, filename: string): string {
  const mime = mimeType?.trim().toLowerCase() ?? "";
  if (mime.includes("pdf")) {
    return "PDF";
  }
  if (mime.startsWith("image/")) {
    const subtype = mime.slice("image/".length).toUpperCase();
    if (subtype === "JPEG" || subtype === "JPG") {
      return "JPEG";
    }
    if (subtype === "PNG") {
      return "PNG";
    }
    if (subtype === "WEBP") {
      return "WEBP";
    }
    if (subtype === "TIFF" || subtype === "TIF") {
      return "TIFF";
    }
    return subtype || "Image";
  }
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return "File";
  }
  return filename.slice(lastDot + 1).toUpperCase();
}
