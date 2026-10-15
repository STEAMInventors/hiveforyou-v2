import "server-only";

import {
  buildRawExtractionInspectorBundle,
  requireSessionUserId,
} from "@hiveforyou/core";
import type { StudyRunStatus } from "@hiveforyou/shared/canonical-study";
import { isStudyRunProcessing } from "@hiveforyou/shared/canonical-study";

import { CaseNotFoundError } from "@/lib/canonical-study/study-service-server";
import { StudyRunNotFoundError } from "@/lib/case-map/case-map-bundle-service-server";
import { loadReaderDocumentExtractionArtifacts } from "@/lib/extraction-debug/load-reader-document-extraction-artifacts";
import { readIntakeEvidenceWorkspaceView } from "@/lib/intake/intake-service-server";
import { createSupabaseHiveGateway } from "@/lib/persistence/hive-gateway";
import {
  SupabaseCaseRepository,
  SupabaseStudyContextRepository,
  SupabaseStudyRunRepository,
} from "@/lib/persistence/supabase-repositories";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";

import {
  isPackDrivenExtractionExploreReady,
  mapInspectorDocumentToCustomerRow,
  resolveReliableSubjectFirstName,
} from "./map-customer-extraction-ui-state";
import type { HiveExtractionProgressView } from "./hive-extraction-progress-types";

export type { HiveExtractionProgressView } from "./hive-extraction-progress-types";

export async function loadHiveExtractionProgressForSession(input: {
  caseId: string;
  studyRunId: string;
}): Promise<HiveExtractionProgressView> {
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

  const documentDateBySourceId = new Map<string, string | undefined>();
  for (const logical of logicalDocuments) {
    if (logical.sourceDocumentId) {
      documentDateBySourceId.set(logical.sourceDocumentId, logical.documentDate);
    }
  }

  const failedDocumentIds = artifacts.terminalArtifact?.failedDocumentIds ?? [];
  const succeededDocumentIds = artifacts.terminalArtifact?.succeededDocumentIds ?? [];

  const documents = bundle.documents.map((doc) =>
    mapInspectorDocumentToCustomerRow({
      doc,
      studyRunStatus: run.status as StudyRunStatus,
      rawExtractionOutcome: bundle.rawExtractionOutcome,
      failedDocumentIds,
      succeededDocumentIds,
      documentDateBySourceId,
    }),
  );

  const intakeRunId = context?.intakeRunId ?? run.intakeRunId ?? null;
  let thingsThatWouldHelp: HiveExtractionProgressView["thingsThatWouldHelp"] = [];
  if (intakeRunId) {
    const intakeView = await readIntakeEvidenceWorkspaceView(intakeRunId);
    thingsThatWouldHelp =
      intakeView?.thingsThatWouldHelp.map((row) => ({
        customerLabel: row.customerLabel,
        packExpectationId: row.packExpectationId,
      })) ?? [];
  }

  const readDocumentCount = documents.filter((row) => row.uiStatus === "read").length;
  const totalDetailCount = documents.reduce(
    (sum, row) => sum + (row.detailCount ?? 0),
    0,
  );

  const rawOutcome = bundle.rawExtractionOutcome;
  const extractionTerminal =
    rawOutcome !== null ||
    (!isStudyRunProcessing(run.status as StudyRunStatus) &&
      (run.status === "FAILED" || run.status === "SUCCEEDED" || run.status === "NEEDS_REVIEW"));

  return {
    caseId: input.caseId,
    studyRunId: input.studyRunId,
    intakeRunId,
    studyRunStatus: run.status as StudyRunStatus,
    rawExtractionOutcome: rawOutcome,
    extractionCompleteForExplore: isPackDrivenExtractionExploreReady(rawOutcome),
    extractionTerminal,
    subjectFirstName: resolveReliableSubjectFirstName(bundle.documents),
    documents,
    thingsThatWouldHelp,
    readDocumentCount,
    totalDetailCount,
  };
}
