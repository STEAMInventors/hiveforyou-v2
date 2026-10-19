import type { ClaimValue, EffectivePeriod } from "@hiveforyou/shared/case-intelligence/3";
import type { DocumentEvidenceRef } from "../validate-document-evidence.js";

export type WireReaderFact = Record<string, unknown>;

function trimOptionalIsoDate(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function periodValueFromWireRecord(record: Record<string, unknown>): ClaimValue | null {
  const start =
    trimOptionalIsoDate(record.periodStart) ??
    trimOptionalIsoDate(record.start) ??
    trimOptionalIsoDate(record.effectiveStart);
  const end =
    trimOptionalIsoDate(record.periodEnd) ??
    trimOptionalIsoDate(record.end) ??
    trimOptionalIsoDate(record.effectiveEnd);
  if (!start && !end) {
    return null;
  }
  return {
    kind: "period",
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
  };
}

export function readerFactIdFromWire(fact: WireReaderFact, index: number): string {
  const id = typeof fact.id === "string" ? fact.id.trim() : "";
  return id || `reader-fact-${index + 1}`;
}

export function claimValueFromWire(value: unknown): ClaimValue | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (kind === "text") {
    const text =
      (typeof record.text === "string" ? record.text : null) ??
      (typeof record.textValue === "string" ? record.textValue : null);
    return text?.trim() ? { kind: "text", text: text.trim() } : null;
  }
  if (kind === "quantity") {
    const amount =
      typeof record.amount === "number"
        ? record.amount
        : typeof record.numberValue === "number"
          ? record.numberValue
          : null;
    return amount !== null && Number.isFinite(amount) ? { kind: "quantity", amount } : null;
  }
  if (kind === "code") {
    const code =
      (typeof record.code === "string" ? record.code : null) ??
      (typeof record.codeValue === "string" ? record.codeValue : null);
    return code?.trim() ? { kind: "code", code: code.trim() } : null;
  }
  if (kind === "boolean" && typeof record.value === "boolean") {
    return { kind: "boolean", value: record.value };
  }
  if (kind === "boolean" && typeof record.booleanValue === "boolean") {
    return { kind: "boolean", value: record.booleanValue };
  }
  if (kind === "entity_ref" && typeof record.entityId === "string") {
    return { kind: "entity_ref", entityId: record.entityId };
  }
  if (kind === "date") {
    const dateValue =
      (typeof record.value === "string" ? record.value : null) ??
      (typeof record.dateValue === "string" ? record.dateValue : null);
    return dateValue?.trim() ? { kind: "date", value: dateValue.trim() } : null;
  }
  if (kind === "period") {
    return periodValueFromWireRecord(record);
  }
  if (typeof record.text === "string" && record.text.trim()) {
    return { kind: "text", text: record.text.trim() };
  }
  if (typeof record.textValue === "string" && record.textValue.trim()) {
    return { kind: "text", text: record.textValue.trim() };
  }
  if (typeof record.amount === "number" && Number.isFinite(record.amount)) {
    return { kind: "quantity", amount: record.amount };
  }
  if (typeof record.numberValue === "number" && Number.isFinite(record.numberValue)) {
    return { kind: "quantity", amount: record.numberValue };
  }
  return null;
}

export function evidenceRefsFromWire(fact: WireReaderFact): DocumentEvidenceRef[] {
  const evidenceRaw = fact.evidence ?? fact.evidenceRefs;
  if (!Array.isArray(evidenceRaw)) {
    return [];
  }
  const refs: DocumentEvidenceRef[] = [];
  for (const item of evidenceRaw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const ev = item as Record<string, unknown>;
    const sourceDocumentId = String(ev.sourceDocumentId ?? ev.documentId ?? "").trim();
    const page = Number(ev.page ?? ev.pageNumber ?? 0);
    const quote = String(ev.quote ?? ev.snippet ?? "").trim();
    if (!sourceDocumentId || page <= 0 || !quote) {
      continue;
    }
    refs.push({
      id: typeof ev.id === "string" ? ev.id : `ev-${refs.length + 1}`,
      sourceType: "document",
      sourceDocumentId,
      page,
      snippet: quote,
      logicalDocumentId:
        typeof ev.logicalDocumentId === "string" ? ev.logicalDocumentId : undefined,
      spanStart: typeof ev.spanStart === "number" ? ev.spanStart : undefined,
      spanEnd: typeof ev.spanEnd === "number" ? ev.spanEnd : undefined,
      extractionId: typeof ev.extractionId === "string" ? ev.extractionId : undefined,
    });
  }
  return refs;
}

export function effectivePeriodFromWire(fact: WireReaderFact): EffectivePeriod | undefined {
  const value = fact.value;
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const start =
    (typeof record.periodStart === "string" ? record.periodStart : null) ??
    (typeof record.effectiveStart === "string" ? record.effectiveStart : null);
  const end =
    (typeof record.periodEnd === "string" ? record.periodEnd : null) ??
    (typeof record.effectiveEnd === "string" ? record.effectiveEnd : null);
  if (start?.trim() && end?.trim()) {
    return { start: start.trim(), end: end.trim() };
  }
  return undefined;
}

export function observedOnFromWire(fact: WireReaderFact): string | undefined {
  const candidates = [
    fact.observedOn,
    fact.observed_on,
    fact.asOfDate,
    fact.effectiveDate,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  const value = fact.value;
  if (value && typeof value === "object") {
    const dateValue = (value as Record<string, unknown>).dateValue;
    if (typeof dateValue === "string" && dateValue.trim()) {
      return dateValue.trim();
    }
  }
  return undefined;
}

const REJECTED_READER_VERIFICATION_STATUSES = new Set([
  "proposed",
  "pending",
  "rejected",
  "unverified",
]);

export type VerifiedReaderFactOptions = {
  /** Facts in reader-accepted-facts/1 passed envelope-level verifier gating. */
  fromReaderAcceptedFactsArtifact?: boolean;
};

export function isVerifiedReaderFact(
  fact: WireReaderFact,
  options?: VerifiedReaderFactOptions,
): boolean {
  if (options?.fromReaderAcceptedFactsArtifact) {
    const status = fact.verificationStatus;
    if (typeof status === "string" && status.trim().toLowerCase() === "rejected") {
      return false;
    }
    return true;
  }
  const status = fact.verificationStatus;
  if (typeof status === "string" && status.trim()) {
    const normalized = status.trim().toLowerCase();
    if (REJECTED_READER_VERIFICATION_STATUSES.has(normalized)) {
      return false;
    }
  }
  return true;
}
