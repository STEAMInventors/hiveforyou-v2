/** Accepted upload types for intake. Bytes are stored only after an explicit commit. */

export const ACCEPTED_UPLOAD_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".png",
  ".jpg",
  ".jpeg",
  ".tiff",
  ".txt",
] as const;

export const ACCEPTED_UPLOAD_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/tiff",
  "text/plain",
].join(",");

export const ACCEPTED_FORMATS_LABEL =
  "Upload multiple documents together · PDF, Word, images, and standard records";

/** Shown beside Add more documents (V2-001B). */
export const ADD_MORE_FORMATS_HINT = "PDF, Word, images, notes";
