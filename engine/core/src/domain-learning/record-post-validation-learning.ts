import { randomUUID } from "node:crypto";

import type { PersistedCaseIntelligence } from "@hiveforyou/canonical";
import type { IntelligenceSourceClass } from "@hiveforyou/shared/domain-learning";
import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";

import type { StudyLearningPrepResult } from "./prepare-study-learning";
import { recordDomainLearningObservation } from "./record-observation";
import type {
  DomainLearningObservationRepository,
  IntelligenceLineageRepository,
} from "./repositories";
import { resolveLineageDocumentProvenance } from "./resolve-lineage-document-provenance";

export function mapEvidenceSourceClass(sourceType: string): IntelligenceSourceClass {
  if (sourceType === "document") {
    return "DOCUMENT_EVIDENCE";
  }
  if (sourceType === "user_response") {
    return "USER_ASSERTION";
  }
  return "DERIVED";
}

function findQuestionAnswerLink(
  prep: StudyLearningPrepResult | undefined,
  match: (question: {
    triggerType: string;
    questionKey: string;
    id: string;
  }) => boolean,
): { questionId: string; answerId: string } | null {
  if (!prep) {
    return null;
  }
  for (const [clientId, question] of prep.questionsByClientId) {
    if (!match(question)) {
      continue;
    }
    const answer = prep.answersByClientId.get(clientId);
    if (answer) {
      return { questionId: question.id, answerId: answer.id };
    }
  }
  return null;
}

export async function recordPostValidationLearning(
  deps: {
    lineage: IntelligenceLineageRepository;
    observations: DomainLearningObservationRepository;
  },
  context: CanonicalStudyContext,
  validation: CanonicalStudyValidationResultV3,
  snapshot: PersistedCaseIntelligence | null,
  userId: string,
  runStatus: "SUCCEEDED" | "NEEDS_REVIEW" | "FAILED",
  prep?: StudyLearningPrepResult,
): Promise<void> {
  const now = new Date().toISOString();
  const lineageRecords = [];
  const analysisIntentLink = findQuestionAnswerLink(
    prep,
    (question) =>
      question.triggerType === "ANALYSIS_INTENT" || question.questionKey === "analysis_intent",
  );
  const userContextLink = findQuestionAnswerLink(
    prep,
    (question) => question.questionKey === "optional_user_context",
  );

  if (snapshot) {
    for (const claim of snapshot.claims) {
      for (const ref of claim.evidenceRefs) {
        const sourceClass = mapEvidenceSourceClass(ref.sourceType);
        const assertionLink =
          sourceClass === "USER_ASSERTION"
            ? userContextLink ?? analysisIntentLink
            : null;
        if (sourceClass === "USER_ASSERTION" && !assertionLink) {
          continue;
        }
        const documentProvenance =
          sourceClass === "DOCUMENT_EVIDENCE"
            ? resolveLineageDocumentProvenance(ref, context)
            : { logicalDocumentId: null, sourceDocumentId: null };
        lineageRecords.push({
          id: randomUUID(),
          userId,
          caseId: context.caseId,
          studyRunId: context.studyRunId,
          intelligenceItemType: "claim",
          intelligenceItemId: claim.id,
          sourceClass,
          logicalDocumentId: documentProvenance.logicalDocumentId,
          sourceDocumentId: documentProvenance.sourceDocumentId,
          questionId: assertionLink?.questionId ?? null,
          answerId: assertionLink?.answerId ?? null,
          parentIntelligenceItemId: null,
          metadata: {
            construct: "construct" in claim ? claim.construct : undefined,
            evidenceRefId: ref.id,
            ...(documentProvenance.logicalDocumentId
              ? { logicalDocumentId: documentProvenance.logicalDocumentId }
              : {}),
          },
          createdAt: now,
        });
      }
      await recordDomainLearningObservation(deps.observations, {
        domainId: context.domainId,
        domainPackId: context.domainPackId,
        domainPackVersion: context.domainPackVersion,
        caseId: context.caseId,
        studyRunId: context.studyRunId,
        observationType: "VALIDATED_CLAIM_CREATED",
        subjectKey: "construct" in claim ? claim.construct : claim.id,
        observationJson: { claimId: claim.id },
      });
    }

    if (context.answerSnapshot.analysisIntent && analysisIntentLink) {
      lineageRecords.push({
        id: randomUUID(),
        userId,
        caseId: context.caseId,
        studyRunId: context.studyRunId,
        intelligenceItemType: "analysis_intent",
        intelligenceItemId: context.studyRunId,
        sourceClass: "ANALYSIS_INTENT" as const,
        sourceDocumentId: null,
        questionId: analysisIntentLink.questionId,
        answerId: analysisIntentLink.answerId,
        parentIntelligenceItemId: null,
        metadata: {
          choiceIds: (context.answerSnapshot.analysisIntent as { choiceIds?: string[] })
            .choiceIds,
        },
        createdAt: now,
      });
    }

    if (context.answerSnapshot.userContext && userContextLink) {
      lineageRecords.push({
        id: randomUUID(),
        userId,
        caseId: context.caseId,
        studyRunId: context.studyRunId,
        intelligenceItemType: "user_context",
        intelligenceItemId: context.studyRunId,
        sourceClass: "USER_CONTEXT" as const,
        sourceDocumentId: null,
        questionId: userContextLink.questionId,
        answerId: userContextLink.answerId,
        parentIntelligenceItemId: null,
        metadata: {
          textLength: String(
            (context.answerSnapshot.userContext as { text?: string }).text ?? "",
          ).length,
        },
        createdAt: now,
      });
    }
  }

  for (const rejected of validation.rejected) {
    await recordDomainLearningObservation(deps.observations, {
      domainId: context.domainId,
      domainPackId: context.domainPackId,
      domainPackVersion: context.domainPackVersion,
      caseId: context.caseId,
      studyRunId: context.studyRunId,
      observationType: "CLAIM_REJECTED",
      subjectKey: rejected.code,
      observationJson: {
        severity: rejected.severity,
        relatedIds: rejected.relatedIds ?? [],
      },
    });
  }

  for (const conflict of validation.accepted.conflicts) {
    await recordDomainLearningObservation(deps.observations, {
      domainId: context.domainId,
      domainPackId: context.domainPackId,
      domainPackVersion: context.domainPackVersion,
      caseId: context.caseId,
      studyRunId: context.studyRunId,
      observationType: "CONFLICT_FOUND",
      subjectKey: conflict.id,
      observationJson: {
        claimIds: conflict.claimIds,
        ...("severity" in conflict && conflict.severity
          ? { severity: conflict.severity }
          : {}),
      },
    });
  }

  for (const unresolved of validation.unresolved) {
    await recordDomainLearningObservation(deps.observations, {
      domainId: context.domainId,
      domainPackId: context.domainPackId,
      domainPackVersion: context.domainPackVersion,
      caseId: context.caseId,
      studyRunId: context.studyRunId,
      observationType: "HUMAN_ADJUDICATION_REQUIRED",
      subjectKey: unresolved.code,
      observationJson: {
        requiresHumanAdjudication: unresolved.requiresHumanAdjudication ?? true,
      },
    });
  }

  if (lineageRecords.length) {
    await deps.lineage.insertMany(lineageRecords);
  }

  await recordDomainLearningObservation(deps.observations, {
    domainId: context.domainId,
    domainPackId: context.domainPackId,
    domainPackVersion: context.domainPackVersion,
    caseId: context.caseId,
    studyRunId: context.studyRunId,
    observationType: runStatus === "FAILED" ? "STUDY_FAILED" : "STUDY_SUCCEEDED",
    subjectKey: runStatus,
    observationJson: { validationStatus: validation.status },
  });
}
