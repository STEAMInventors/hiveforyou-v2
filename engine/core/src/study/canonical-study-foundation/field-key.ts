import { createHash } from "node:crypto";

export function buildFieldKey(input: {
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
  fieldId: string;
}): string {
  return `${input.sourceDocumentId}|${input.recordTypeId}|${input.instanceIndex}|${input.fieldId}`;
}

export function buildRecordGroupId(input: {
  sourceDocumentId: string;
  recordTypeId: string;
  instanceIndex: number;
}): string {
  const material = `${input.sourceDocumentId}|${input.recordTypeId}|${input.instanceIndex}`;
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

export function parsePackFieldPath(path: string): { recordTypeId: string; fieldId: string } | null {
  const trimmed = path.trim();
  const dot = trimmed.indexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) {
    return null;
  }
  return {
    recordTypeId: trimmed.slice(0, dot),
    fieldId: trimmed.slice(dot + 1),
  };
}
