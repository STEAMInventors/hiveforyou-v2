export class PdfOpenError extends Error {
  readonly code: "ENCRYPTED_PDF" | "NATIVE_TEXT_RECOVERY_FAILURE";

  constructor(code: PdfOpenError["code"], message: string, cause?: unknown) {
    super(message);
    this.name = "PdfOpenError";
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
