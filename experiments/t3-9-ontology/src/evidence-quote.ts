import type { EvidenceReferenceV4 } from "@hiveforyou/shared/case-intelligence/4";

/** v4 evidence uses `quote`; legacy wire paths may still carry `snippet`. */
export function evidenceQuoteText(ref: EvidenceReferenceV4): string {
  const quote = typeof ref.quote === "string" ? ref.quote.trim() : "";
  const snippet = typeof (ref as { snippet?: string }).snippet === "string"
    ? (ref as { snippet: string }).snippet.trim()
    : "";
  return quote || snippet;
}
