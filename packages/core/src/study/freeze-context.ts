import type { ResolvedDomainPack } from "@hiveforyou/domain-packs";

import type { CaseCustomerContextSnapshot } from "@hiveforyou/shared/case-customer-context";
import { scopeDiscoveryResultToDomain } from "../discover/domain-workstream";
import { customerContextForEngine2 } from "../persistence/case-customer-context-repository";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";
import {
  CANONICAL_STUDY_CONTEXT_SCHEMA,
  type CanonicalStudyContext,
} from "@hiveforyou/shared/canonical-study";

import {
  computeStudyIdempotencyKey,
  fingerprintAnswerSnapshot,
  fingerprintSourceDocuments,
  type StudyEngineFingerprint,
} from "./fingerprint";

export type FreezeContextParams = {
  request: StartCanonicalStudyRequest;
  studyRunId: string;
  resolvedPack: ResolvedDomainPack;
  idempotencyKey: string;
  providerId: string;
  providerMode: "fixture" | "openai" | "unconfigured";
  previousCaseIntelligenceVersion?: number;
  prompt?: {
    id: string;
    version: string;
    sha256: string;
  };
  customerContext?: CaseCustomerContextSnapshot | null;
};

export function buildIdempotencyKeyFromRequest(
  request: StartCanonicalStudyRequest,
  resolvedPack: ResolvedDomainPack,
  engine: StudyEngineFingerprint,
): string {
  const intakeMaterial =
    request.intakeRunId && request.intakeStudyMaterialFingerprint
      ? request.intakeStudyMaterialFingerprint
      : null;

  return computeStudyIdempotencyKey({
    caseId: request.caseId,
    domainId: resolvedPack.domainId,
    domainPackId: resolvedPack.domainPackId,
    domainPackVersion: resolvedPack.domainPackVersion,
    documentFingerprint: intakeMaterial ?? fingerprintSourceDocuments(request),
    answerFingerprint: fingerprintAnswerSnapshot(request),
    intakeRunId: request.intakeRunId ?? null,
    intakeStudyMaterialFingerprint: intakeMaterial,
    engine,
  });
}

export function studyEngineFingerprintFromDeps(input: {
  providerMode: StudyEngineFingerprint["providerMode"];
  providerId: string;
  modelId?: string;
  prompt?: { version: string; sha256: string };
}): StudyEngineFingerprint {
  return {
    providerMode: input.providerMode,
    providerId: input.providerId,
    modelId: input.modelId,
    promptVersion: input.prompt?.version,
    promptSha256: input.prompt?.sha256,
  };
}

export function freezeCanonicalStudyContext(
  params: FreezeContextParams,
): CanonicalStudyContext {
  const { request, studyRunId, resolvedPack, idempotencyKey, providerId, providerMode } =
    params;
  const engine1Result = scopeDiscoveryResultToDomain(request.engine1Result, resolvedPack.domainId);
  const stagedIds = new Set(
    engine1Result.documents
      .map((doc) => doc.stagedDocumentId)
      .filter((id): id is string => Boolean(id)),
  );
  const sourceDocuments =
    stagedIds.size > 0
      ? request.sourceDocuments.filter((doc) => stagedIds.has(doc.stagedDocumentId))
      : request.sourceDocuments;

  return {
    schemaVersion: CANONICAL_STUDY_CONTEXT_SCHEMA,
    caseId: request.caseId,
    studyRunId,
    idempotencyKey,
    createdAt: new Date().toISOString(),
    intakeRunId: request.intakeRunId,
    discoveryRunId: request.discoveryRunId,
    domainLabel: request.engine1Result.domainLabel,
    domainId: resolvedPack.domainId,
    domainPackId: resolvedPack.domainPackId,
    domainPackVersion: resolvedPack.domainPackVersion,
    domainPackVocabulary: structuredClone(resolvedPack.vocabulary),
    sourceDocuments: structuredClone(sourceDocuments),
    engine1Result: structuredClone(engine1Result),
    questionSetVersion: request.questionSet.id,
    questionSet: structuredClone(request.questionSet),
    answerSnapshot: structuredClone(request.answerSnapshot),
    previousCaseIntelligenceVersion: params.previousCaseIntelligenceVersion,
    answerSnapshotId: request.answerSnapshotId,
    customerContext: customerContextForEngine2(params.customerContext, resolvedPack.domainId),
    logicalDocuments: [],
    processingPolicy: {
      intentAffectsFacts: false,
      providerId,
      providerMode,
      promptId: params.prompt?.id,
      promptVersion: params.prompt?.version,
      promptSha256: params.prompt?.sha256,
    },
  };
}
