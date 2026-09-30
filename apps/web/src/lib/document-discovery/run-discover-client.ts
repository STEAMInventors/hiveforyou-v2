import type { CaseCustomerContextIntake } from "@hiveforyou/shared/case-customer-context";
import type { CustomerDiscoveryAnswer, HiveDiscoverResult } from "@hiveforyou/shared/discover";

import { getOrCreateClientCaseId } from "@/lib/canonical-study/map-start-request";
import { logDiscoverClientBoundary } from "@/lib/document-discovery/discover-dev-log";
import type { StagedDocument } from "@/lib/staged-documents";

const inFlightDiscoverRuns = new Map<string, Promise<HiveDiscoverResult>>();

function discoverRunRequestKey(caseId: string, sourceDocumentIds: string[]): string {
  const sorted = [...sourceDocumentIds].sort();
  return `${caseId}:${sorted.join(",")}`;
}

function sourceDocumentIdsFromStaged(stagedDocuments: StagedDocument[]): string[] {
  return stagedDocuments.map((doc) => doc.id);
}

export async function runDiscoverForStagedDocuments(
  stagedDocuments: StagedDocument[],
): Promise<HiveDiscoverResult> {
  const caseId = getOrCreateClientCaseId();
  const sourceDocumentIds = sourceDocumentIdsFromStaged(stagedDocuments);
  const requestKey = discoverRunRequestKey(caseId, sourceDocumentIds);
  const existing = inFlightDiscoverRuns.get(requestKey);
  if (existing) {
    return existing;
  }

  const promise = postDiscoverRun({ caseId, sourceDocumentIds });
  inFlightDiscoverRuns.set(requestKey, promise);
  try {
    return await promise;
  } finally {
    if (inFlightDiscoverRuns.get(requestKey) === promise) {
      inFlightDiscoverRuns.delete(requestKey);
    }
  }
}

export async function continueDiscoverForStagedDocuments(input: {
  stagedDocuments: StagedDocument[];
  discoverRunId: string;
  customerAnswers: CustomerDiscoveryAnswer[];
  caseCustomerContextIntake?: CaseCustomerContextIntake;
}): Promise<HiveDiscoverResult> {
  const caseId = getOrCreateClientCaseId();
  const sourceDocumentIds = sourceDocumentIdsFromStaged(input.stagedDocuments);
  return postDiscoverContinue({
    caseId,
    sourceDocumentIds,
    discoverRunId: input.discoverRunId,
    customerAnswers: input.customerAnswers,
    caseCustomerContextIntake: input.caseCustomerContextIntake,
  });
}

async function postDiscoverRun(body: {
  caseId: string;
  sourceDocumentIds: string[];
}): Promise<HiveDiscoverResult> {
  const response = await fetch("/api/discover/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error("DISCOVER_REQUEST_FAILED");
  }
  const payload = (await response.json()) as HiveDiscoverResult;
  logDiscoverClientBoundary("http:run", {
    status: payload.run.status,
    hasDocumentDiscovery: Boolean(payload.documentDiscovery),
  });
  return payload;
}

async function postDiscoverContinue(body: {
  caseId: string;
  sourceDocumentIds: string[];
  discoverRunId: string;
  customerAnswers: CustomerDiscoveryAnswer[];
  caseCustomerContextIntake?: CaseCustomerContextIntake;
}): Promise<HiveDiscoverResult> {
  const response = await fetch("/api/discover/continue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let errorCode: string | undefined;
    let message: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      errorCode = typeof body.error === "string" ? body.error : undefined;
      message = typeof body.message === "string" ? body.message : undefined;
    } catch {
      // ignore non-JSON error bodies
    }
    if (process.env.NODE_ENV === "development") {
      const parts = [`DISCOVER_CONTINUE_FAILED`, `status=${response.status}`];
      if (errorCode) {
        parts.push(`error=${errorCode}`);
      }
      if (message) {
        parts.push(`message=${message}`);
      }
      throw new Error(parts.join(" "));
    }
    throw new Error("DISCOVER_CONTINUE_FAILED");
  }
  const payload = (await response.json()) as HiveDiscoverResult;
  logDiscoverClientBoundary("http:continue", {
    status: payload.run.status,
    hasDocumentDiscovery: Boolean(payload.documentDiscovery),
    errorCode: payload.run.errorCode,
  });
  return payload;
}
