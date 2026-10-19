import {
  recordAdHocIntakeLearningCandidate,
  type DomainLearningCandidateRepository,
} from "@hiveforyou/core";
import type { IntakePackExecutionResult } from "@hiveforyou/domain-pack";
import { defaultDeclarativePackRepoRoot } from "@hiveforyou/domain-packs/declarative";
import { resolveMappingPackForDomain } from "@hiveforyou/domain-packs/mapping-pack";
import type { EphemeralSchemaInsert } from "@hiveforyou/shared/intake/ephemeral-schema";
import type { StudyIntent } from "@hiveforyou/shared/intake/study-intent";

import {
  collectDocumentSamples,
  generateEphemeralSchema,
} from "./dynamic-schema-generator";
import { resolveIntakeDomain } from "./domain-resolution";
import type { JevDomainDecision } from "./jev-domain-client";
import {
  decideIntakeDomainFromRawIntent,
  inferIntakeDomainFromIdentities,
  isRoutableLocalDomainChoice,
} from "./local-domain-routing";
import { runPackExecutionForIntake } from "./run-pack-execution";
import type {
  DocumentIdentityRecord,
  DocumentNormalizedExtractionRecord,
  IntakeRunRecord,
} from "./types";

export type CompleteIntakeDomainInput = {
  run: IntakeRunRecord;
  identities: DocumentIdentityRecord[];
  filenamesBySourceId: Record<string, string>;
  normalizedBySourceId: Record<string, DocumentNormalizedExtractionRecord>;
  decideDomain?: (rawIntent: string) => Promise<JevDomainDecision>;
  persistEphemeralSchema?: (data: EphemeralSchemaInsert) => Promise<string>;
  domainLearningCandidates?: DomainLearningCandidateRepository;
};

export type CompleteIntakeDomainResult = {
  run: IntakeRunRecord;
  packExecution: IntakePackExecutionResult | null;
};

function resolvedSchemaIdForDomain(domainId: string): string {
  try {
    const resolved = resolveMappingPackForDomain({
      domainId,
      domainResolution: "known",
      repoRoot: defaultDeclarativePackRepoRoot(),
      allowPrerelease: true,
    });
    return `${resolved.pin.packId}_v${resolved.pin.packVersion}`;
  } catch {
    return `${domainId}_pack`;
  }
}

function buildExplicitStudyIntent(input: {
  domainId: string;
  originalGoal: string | null;
}): StudyIntent {
  return {
    schemaVersion: "hive.study-intent/1",
    selectedDomainId: input.domainId,
    resolvedSchemaId: resolvedSchemaIdForDomain(input.domainId),
    schemaSource: "pinned_pack",
    routingPath: "explicit",
    originalGoal: input.originalGoal,
    interpretedTask: null,
    clarificationStatus: "not_required",
  };
}

export async function completeIntakeDomainPack(
  input: CompleteIntakeDomainInput,
): Promise<CompleteIntakeDomainResult> {
  const rawIntent = input.run.rawIntent?.trim() || null;
  const selectedDomainId = input.run.selectedDomainId?.trim() || null;

  let jevProposal: string | null = input.run.jevDomainProposal;
  let jevConfidence: number | null = input.run.jevDomainConfidence;

  if (!selectedDomainId && rawIntent && input.decideDomain) {
    const decision = await input.decideDomain(rawIntent);
    jevProposal = decision.choice;
    jevConfidence = decision.confidence;
  }

  if (!selectedDomainId && !jevProposal && rawIntent) {
    const local = decideIntakeDomainFromRawIntent(rawIntent);
    if (local && isRoutableLocalDomainChoice(local.choice)) {
      jevProposal = local.choice;
      jevConfidence = local.confidence;
    }
  }

  if (!selectedDomainId && !jevProposal) {
    const fromDocuments = inferIntakeDomainFromIdentities(input.identities);
    if (fromDocuments && isRoutableLocalDomainChoice(fromDocuments.choice)) {
      jevProposal = fromDocuments.choice;
      jevConfidence = fromDocuments.confidence;
    }
  }

  const resolution = resolveIntakeDomain({
    rawIntent,
    selectedDomainId,
    jevDomainProposal: jevProposal,
    jevDomainConfidence: jevConfidence,
  });

  let packExecution: IntakePackExecutionResult | null = null;
  const participatingIdentities = input.identities.filter(
    (identity) => identity.analysisDisposition !== "DISCARDED",
  );

  if (resolution.studyPath === "DOMAIN_PACK" && resolution.resolvedDomainId) {
    const documents = participatingIdentities
      .map((identity) => {
        const normalized = input.normalizedBySourceId[identity.sourceDocumentId];
        if (!normalized) {
          return null;
        }
        return {
          sourceDocumentId: identity.sourceDocumentId,
          filename: input.filenamesBySourceId[identity.sourceDocumentId] ?? "document",
          identity,
          normalized: normalized.normalizedExtraction,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    packExecution = await runPackExecutionForIntake({
      resolvedDomainId: resolution.resolvedDomainId,
      documents,
    });
  }

  let studyIntent = input.run.studyIntent ?? null;
  if (
    resolution.resolutionSource === "EXPLICIT" &&
    resolution.studyPath === "DOMAIN_PACK" &&
    resolution.resolvedDomainId
  ) {
    studyIntent = buildExplicitStudyIntent({
      domainId: resolution.resolvedDomainId,
      originalGoal: input.run.rawIntent,
    });
  } else if (resolution.studyPath === "GENERIC_STUDY") {
    if (!input.persistEphemeralSchema) {
      throw new Error(
        "persistEphemeralSchema is required when intake resolves to GENERIC_STUDY (ad-hoc dynamic schema).",
      );
    }
    const documentSamples = collectDocumentSamples(
      participatingIdentities,
      input.normalizedBySourceId,
    );
    const dynamicResponse = await generateEphemeralSchema(
      {
        rawIntent: rawIntent ?? "",
        documentSamples,
      },
      input.persistEphemeralSchema,
    );
    studyIntent = {
      schemaVersion: "hive.study-intent/1",
      selectedDomainId: null,
      resolvedSchemaId: dynamicResponse.schemaId,
      schemaSource: "dynamic_generation",
      routingPath: "ad-hoc",
      originalGoal: input.run.rawIntent,
      interpretedTask: dynamicResponse.interpretedTask,
      clarificationStatus: "not_required",
    };
    // PER SPEC: Ad-hoc telemetry is append-only. Do not trigger automatic domain pack generation here.
    if (input.domainLearningCandidates) {
      await recordAdHocIntakeLearningCandidate(input.domainLearningCandidates, {
        rawIntent: studyIntent.originalGoal,
        ephemeralSchemaId: studyIntent.resolvedSchemaId,
        intakeRunId: input.run.id,
        caseId: input.run.caseId,
      });
    }
  }

  const updatedRun: IntakeRunRecord = {
    ...input.run,
    jevDomainProposal: jevProposal,
    jevDomainConfidence: jevConfidence,
    resolvedDomainId: resolution.resolvedDomainId,
    resolutionSource: resolution.resolutionSource,
    studyPath: resolution.studyPath,
    studyIntent,
    packExecutionJson: packExecution ? JSON.stringify(packExecution) : null,
    updatedAt: new Date().toISOString(),
  };

  return { run: updatedRun, packExecution };
}
