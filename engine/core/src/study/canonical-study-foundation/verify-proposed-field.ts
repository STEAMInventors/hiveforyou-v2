import type { ProposalDomainPack, ProposalRecordField } from "@hiveforyou/domain-pack";
import { findConsecutiveWordQuote } from "../../document/find-consecutive-word-quote.js";
import type { DocumentPages, PageWord } from "../../document/page-model.js";
import {
  normalizeAttributeRaw,
  normalizeMoney,
  normalizePartialDate,
} from "../../atoms/normalize.js";
import { normalizeQuoteForMatch } from "../../document/normalize-quote-text.js";
import type {
  CanonicalStudyFoundationEvidence,
  CanonicalStudyFoundationProposedField,
} from "@hiveforyou/shared/canonical-study-foundation";

export type VerifyFieldResult =
  | { status: "verified"; verifiedEvidence: CanonicalStudyFoundationEvidence[]; reasons: [] }
  | { status: "rejected"; reasons: string[] }
  | { status: "unresolved"; reasons: string[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function resolveFieldDef(
  pack: ProposalDomainPack,
  recordTypeId: string,
  fieldId: string,
): ProposalRecordField | null {
  const record = pack.recordTypes.find((r) => r.id === recordTypeId);
  return record?.fields.find((f) => f.id === fieldId) ?? null;
}

function orderedWords(words: readonly PageWord[]): PageWord[] {
  return [...words].sort((a, b) => a.seq - b.seq);
}

function verifyQuoteOnPage(
  documentPages: DocumentPages,
  ev: CanonicalStudyFoundationEvidence,
): CanonicalStudyFoundationEvidence | { reason: string } {
  if (documentPages.documentId !== ev.sourceDocumentId) {
    return { reason: `Document identity mismatch for ${ev.sourceDocumentId}.` };
  }
  const page = documentPages.pages.find((p) => p.pageNumber === ev.page);
  if (!page) {
    return { reason: `Page ${ev.page} is out of bounds for document ${ev.sourceDocumentId}.` };
  }
  const quote = ev.quote.trim();
  if (!quote) {
    return { reason: "Evidence quote is empty." };
  }
  const match = findConsecutiveWordQuote(page.words, quote);
  if (!match) {
    return {
      reason: `Quote does not match page ${ev.page} word sequence for ${ev.sourceDocumentId}.`,
    };
  }
  const sorted = orderedWords(page.words);
  const startWord = sorted[match.wordStartIndex]!;
  const endWord = sorted[match.wordEndIndex]!;
  return {
    sourceDocumentId: ev.sourceDocumentId,
    page: ev.page,
    quote,
    spanStart: startWord.seq,
    spanEnd: endWord.seq,
    wordStartIndex: match.wordStartIndex,
    wordEndIndex: match.wordEndIndex,
  };
}

function quoteContainsNormalizedDate(quote: string, isoDate: string): boolean {
  const normalizedQuote = normalizeQuoteForMatch(quote);
  if (normalizedQuote.includes(isoDate)) {
    return true;
  }
  const parts = isoDate.split("-");
  const year = parts[0]!;
  const month = Number.parseInt(parts[1]!, 10);
  const day = Number.parseInt(parts[2]!, 10);
  const mdyVariants = [
    `${month}/${day}/${year}`,
    `${month}/${day}/${year.slice(-2)}`,
    `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`,
  ];
  return mdyVariants.some((variant) => normalizedQuote.includes(variant));
}

function quoteContainsNumber(quote: string, value: number): boolean {
  const normalizedQuote = normalizeQuoteForMatch(quote);
  const asInt = String(Math.trunc(value));
  const asFixed = value % 1 === 0 ? asInt : String(value);
  if (normalizedQuote.includes(asFixed)) {
    return true;
  }
  const money = normalizeMoney(normalizedQuote);
  return money != null && Math.abs(money - value) < 0.01;
}

function verifyValueRepresentation(
  field: CanonicalStudyFoundationProposedField,
  def: ProposalRecordField | null,
  quote: string,
): string | null {
  const value = field.displayValue;
  if (value == null) {
    return null;
  }

  switch (field.valueKind) {
    case "date": {
      const raw = typeof value === "string" ? value : String(value);
      const iso =
        ISO_DATE.test(raw) ? raw : normalizePartialDate(raw, null, null);
      if (!iso) {
        return "date value is not parseable";
      }
      if (!quoteContainsNormalizedDate(quote, iso)) {
        return "date value does not match evidence quote representation";
      }
      return null;
    }
    case "quantity": {
      let numeric: number | null = null;
      if (typeof value === "number" && Number.isFinite(value)) {
        numeric = value;
      } else if (typeof value === "string") {
        numeric = normalizeMoney(value) ?? Number.parseFloat(value);
      }
      if (numeric == null || !Number.isFinite(numeric)) {
        return "quantity value is not numeric";
      }
      if (!quoteContainsNumber(quote, numeric)) {
        return "quantity value does not match evidence quote representation";
      }
      return null;
    }
    case "code":
    case "text": {
      if (typeof value !== "string") {
        return null;
      }
      if (field.provenance === "quoted") {
        const normalizedValue = normalizeAttributeRaw(value);
        const normalizedQuote = normalizeAttributeRaw(quote);
        if (!normalizedQuote.includes(normalizedValue)) {
          return "quoted text value does not appear in evidence quote";
        }
      }
      return null;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        return "boolean value invalid";
      }
      return null;
    }
    default:
      return null;
  }
}

function verifyEnum(
  field: CanonicalStudyFoundationProposedField,
  def: ProposalRecordField | null,
): string | null {
  if (field.provenance !== "classified" || !def?.enum?.length) {
    return null;
  }
  const code =
    typeof field.displayValue === "string"
      ? field.displayValue
      : field.displayValue == null
        ? null
        : String(field.displayValue);
  if (!code) {
    return "classified value missing";
  }
  if (!def.enum.includes(code)) {
    return `classified value ${code} not in pack enum`;
  }
  return null;
}

export function verifyProposedField(input: {
  field: CanonicalStudyFoundationProposedField;
  pack: ProposalDomainPack;
  documentPages: DocumentPages | null;
}): VerifyFieldResult {
  const { field } = input;

  if (field.missingState) {
    return {
      status: "unresolved",
      reasons: [`Field marked missingState=${field.missingState}.`],
    };
  }

  const def = resolveFieldDef(input.pack, field.recordTypeId, field.fieldId);
  if (
    def?.source.includes("derived") &&
    !def.source.some((s: string) => s === "quoted" || s === "classified")
  ) {
    return {
      status: "unresolved",
      reasons: ["Derived-only field must be computed by engine, not emitted as proposed."],
    };
  }

  if ((field.provenance === "quoted" || field.provenance === "classified") && !field.evidence) {
    return { status: "rejected", reasons: [`Evidence required for provenance ${field.provenance}.`] };
  }

  const enumIssue = verifyEnum(field, def);
  if (enumIssue) {
    return { status: "rejected", reasons: [enumIssue] };
  }

  if (!field.evidence) {
    return { status: "unresolved", reasons: ["Field has no evidence and is not a missing-state row."] };
  }

  if (!input.documentPages) {
    return { status: "rejected", reasons: [`Trusted document pages unavailable for ${field.sourceDocumentId}.`] };
  }

  const quoteResult = verifyQuoteOnPage(input.documentPages, field.evidence);
  if ("reason" in quoteResult) {
    return { status: "rejected", reasons: [quoteResult.reason] };
  }

  const valueIssue = verifyValueRepresentation(field, def, field.evidence.quote);
  if (valueIssue) {
    return { status: "rejected", reasons: [valueIssue] };
  }

  return { status: "verified", verifiedEvidence: [quoteResult], reasons: [] };
}
