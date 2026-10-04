import type { RecoveredPage, SourceIssue, SupportedFileKind } from "./contracts";
import type { OcrEngine } from "./ocrEngine";
import { buildRecoveredPage } from "./buildRecoveredPage";

export interface ImageRecoveryContext {
  readonly runId: string;
  readonly stepId: string;
  readonly sourceDocumentId: string;
  readonly ocrEngine?: OcrEngine;
}

export async function recoverImagePages(
  bytes: Uint8Array,
  kind: Extract<SupportedFileKind, "jpeg" | "png">,
  context: ImageRecoveryContext,
): Promise<RecoveredPage> {
  const issues: SourceIssue[] = [
    {
      code: "OCR_REQUIRED",
      message: "Image uploads are recovered with local OCR only.",
      pageNumber: 1,
    },
  ];

  if (context.ocrEngine === undefined) {
    issues.push({
      code: "OCR_FAILED",
      message: "Image OCR required but no local OCR engine was configured.",
      pageNumber: 1,
    });
    return buildRecoveredPage({
      runId: context.runId,
      sourceDocumentId: context.sourceDocumentId,
      pageNumber: 1,
      extractionMethod: "OCR",
      items: [],
      sourceIssues: issues,
    });
  }

  try {
    const result = await context.ocrEngine.recognizePage(
      {
        bytes,
        width: 0,
        height: 0,
        mimeType: kind === "jpeg" ? "image/jpeg" : "image/png",
      },
      {
        runId: context.runId,
        stepId: context.stepId,
        sourceDocumentId: context.sourceDocumentId,
        pageNumber: 1,
      },
    );
    return buildRecoveredPage({
      runId: context.runId,
      sourceDocumentId: context.sourceDocumentId,
      pageNumber: 1,
      extractionMethod: "OCR",
      items: result.lines.map((line) =>
        line.boundingBox === undefined
          ? { text: line.text }
          : { text: line.text, boundingBox: line.boundingBox },
      ),
      sourceIssues: issues,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local OCR failed for an image document.";
    throw new Error(message);
  }
}
