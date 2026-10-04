import { JEV_DOMAIN_NO_MATCH, type JevDomainDecision } from "./jev-domain-client";
import type { DocumentIdentityRecord } from "./types";

const LOCAL_DOMAIN_MODEL = "local-domain-v1";

export function decideIntakeDomainFromRawIntent(rawIntent: string): JevDomainDecision | null {
  const trimmed = rawIntent.trim();
  if (!trimmed) {
    return null;
  }
  if (
    /\b(iep|individualized education program|special education|504 plan|iep meeting|reevaluation)\b/i.test(
      trimmed,
    )
  ) {
    return {
      choice: "iep",
      confidence: 0.88,
      returnedModel: LOCAL_DOMAIN_MODEL,
      classifierVersion: null,
    };
  }
  if (/\b(medicaid|notice of action|denial letter)\b/i.test(trimmed)) {
    return {
      choice: "medicaid",
      confidence: 0.85,
      returnedModel: LOCAL_DOMAIN_MODEL,
      classifierVersion: null,
    };
  }
  if (/\b(bankruptcy|chapter 7|chapter 13)\b/i.test(trimmed)) {
    return {
      choice: "bankruptcy",
      confidence: 0.85,
      returnedModel: LOCAL_DOMAIN_MODEL,
      classifierVersion: null,
    };
  }
  return null;
}

export function inferIntakeDomainFromIdentities(
  identities: DocumentIdentityRecord[],
): JevDomainDecision | null {
  const classified = identities.filter(
    (identity) =>
      identity.analysisDisposition !== "DISCARDED" &&
      (identity.processingStatus === "CLASSIFIED" || identity.processingStatus === "NEEDS_REVIEW"),
  );
  if (classified.length === 0) {
    return null;
  }

  const counts = new Map<string, number>();
  for (const identity of classified) {
    if (!identity.proposedType) {
      continue;
    }
    counts.set(identity.proposedType, (counts.get(identity.proposedType) ?? 0) + 1);
  }

  const iepCount = counts.get("iep_document") ?? 0;
  if (iepCount > 0 && iepCount >= Math.ceil(classified.length / 2)) {
    return {
      choice: "iep",
      confidence: Math.min(0.92, 0.75 + iepCount * 0.05),
      returnedModel: LOCAL_DOMAIN_MODEL,
      classifierVersion: null,
    };
  }

  const medicaidCount = counts.get("medicaid_document") ?? 0;
  if (medicaidCount > 0 && medicaidCount >= Math.ceil(classified.length / 2)) {
    return {
      choice: "medicaid",
      confidence: 0.82,
      returnedModel: LOCAL_DOMAIN_MODEL,
      classifierVersion: null,
    };
  }

  const bankruptcyCount = counts.get("bankruptcy_filing") ?? 0;
  if (bankruptcyCount > 0 && bankruptcyCount >= Math.ceil(classified.length / 2)) {
    return {
      choice: "bankruptcy",
      confidence: 0.82,
      returnedModel: LOCAL_DOMAIN_MODEL,
      classifierVersion: null,
    };
  }

  return null;
}

export function isRoutableLocalDomainChoice(choice: string): boolean {
  return choice !== JEV_DOMAIN_NO_MATCH && choice.trim().length > 0;
}
