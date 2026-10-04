import type { RecoveredPage, SupportedFileKind } from "./contracts";
import { recoverImagePages } from "./imageHandler";
import { recoverPdfPages } from "./pdfHandler";
import type { RecoveryContext } from "./recovery-context";

export type { RecoveryContext } from "./recovery-context";

export async function recoverSourcePages(
  bytes: Uint8Array,
  kind: Extract<SupportedFileKind, "pdf" | "jpeg" | "png">,
  context: RecoveryContext,
): Promise<RecoveredPage[]> {
  if (kind === "pdf") {
    return recoverPdfPages(bytes, context);
  }
  return [await recoverImagePages(bytes, kind, context)];
}
