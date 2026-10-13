import "server-only";

import {
  buildRawExtractionInspectorBundle,
  requireSessionUserId,
  type RawExtractionInspectorBundle,
} from "@hiveforyou/core";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { StudyRunNotFoundError } from "@/lib/case-map/case-map-bundle-service-server";
import { createSupabaseHiveGateway } from "@/lib/persistence/hive-gateway";
import {
  SupabaseCaseRepository,
  SupabaseStudyContextRepository,
  SupabaseStudyRunRepository,
} from "@/lib/persistence/supabase-repositories";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";

import { loadReaderDocumentExtractionArtifacts } from "./load-reader-document-extraction-artifacts";

export class RawExtractionNotFoundError extends Error {
  readonly code = "RAW_EXTRACTION_NOT_FOUND";

  constructor() {
    super("Raw extraction artifacts were not found for this study run.");
    this.name = "RawExtractionNotFoundError";
  }
}

function hasRawExtractionArtifactEvidence(input: {
  terminalArtifact: unknown | null;
  studyRunManifest: unknown | null;
  attemptManifest: unknown | null;
  envelopesBySourceDocumentId: Map<string, unknown>;
}): boolean {
  return (
    input.terminalArtifact !== null ||
    input.studyRunManifest !== null ||
    input.attemptManifest !== null ||
    input.envelopesBySourceDocumentId.size > 0
  );
}

export async function loadRawExtractionInspectorBundle(input: {
  caseId: string;
  studyRunId: string;
}): Promise<RawExtractionInspectorBundle & { intakeRunId: string | null }> {
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const gateway = createSupabaseHiveGateway(await createServerSupabaseClient());

  const ownedCase = await new SupabaseCaseRepository(gateway, sessionUserId).getById(
    sessionUserId,
    input.caseId,
  );
  if (!ownedCase) {
    throw new CaseNotFoundError();
  }

  const run = await new SupabaseStudyRunRepository(gateway, sessionUserId).getByStudyRunId(
    input.studyRunId,
  );
  if (!run || run.caseId !== input.caseId) {
    throw new StudyRunNotFoundError();
  }

  const context = await new SupabaseStudyContextRepository(gateway, sessionUserId).getByStudyRunId(
    input.studyRunId,
  );

  const logicalDocuments =
    context?.structureMap?.logicalDocuments ?? context?.logicalDocuments ?? [];
  const fallbackSourceDocumentIds = [
    ...(context?.sourceDocuments.map((doc) => doc.sourceDocumentId) ?? []),
  ].filter((id): id is string => typeof id === "string" && id.trim().length > 0);

  const preliminary = await loadReaderDocumentExtractionArtifacts({
    gateway,
    sessionUserId,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    logicalDocuments,
    fallbackSourceDocumentIds,
  });

  const artifacts = await loadReaderDocumentExtractionArtifacts({
    gateway,
    sessionUserId,
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    logicalDocuments,
    fallbackSourceDocumentIds: [
      ...fallbackSourceDocumentIds,
      ...(preliminary.attemptManifest?.documents.map((doc) => doc.sourceDocumentId) ?? []),
      ...(preliminary.terminalArtifact?.succeededDocumentIds ?? []),
      ...(preliminary.terminalArtifact?.failedDocumentIds ?? []),
    ],
  });

  if (artifacts.studyRunManifest && artifacts.studyRunManifest.caseId !== input.caseId) {
    throw new RawExtractionNotFoundError();
  }
  if (artifacts.attemptManifest && artifacts.attemptManifest.caseId !== input.caseId) {
    throw new RawExtractionNotFoundError();
  }

  for (const envelope of artifacts.envelopesBySourceDocumentId.values()) {
    if (
      envelope.userId !== sessionUserId ||
      envelope.caseId !== input.caseId ||
      envelope.studyRunId !== input.studyRunId
    ) {
      throw new RawExtractionNotFoundError();
    }
  }

  if (
    !hasRawExtractionArtifactEvidence({
      terminalArtifact: artifacts.terminalArtifact,
      studyRunManifest: artifacts.studyRunManifest,
      attemptManifest: artifacts.attemptManifest,
      envelopesBySourceDocumentId: artifacts.envelopesBySourceDocumentId,
    })
  ) {
    throw new RawExtractionNotFoundError();
  }

  const bundle = buildRawExtractionInspectorBundle({
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    studyRunStatus: run.status,
    attemptId: artifacts.attemptId,
    terminalArtifact: artifacts.terminalArtifact,
    studyRunManifest: artifacts.studyRunManifest,
    attemptManifest: artifacts.attemptManifest,
    envelopesBySourceDocumentId: artifacts.envelopesBySourceDocumentId,
    orderedSourceDocumentIds: artifacts.orderedSourceDocumentIds,
    logicalDocuments,
  });

  return {
    ...bundle,
    intakeRunId: context?.intakeRunId ?? run.intakeRunId ?? null,
  };
}
