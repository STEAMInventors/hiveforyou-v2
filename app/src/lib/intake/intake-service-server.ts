import "server-only";

import "@hiveforyou/domain-packs";
import { classifyIepDocumentLocally, getDomainPackManifest } from "@hiveforyou/domain-packs";
import { requireSessionUserId, UnauthenticatedError } from "@hiveforyou/core";
import {
  decideIntakeDocumentIdentity,
  prepareExtendIntakeRun,
  extractDocument,
  mapWithConcurrency,
  openIntakeRun,
  setIntakeSourceAnalysisDisposition,
  type IntakeExecutionDeps,
  type IntakeRunRecord,
  type IntakeSourceDocument,
  type OpenedIntakeRun,
} from "@hiveforyou/intake";
import { recoverNormalizedDocument } from "@hiveforyou/intake/server-extraction";
import {
  NORMALIZED_EXTRACTION_SCHEMA_VERSION,
  toIntakeEvidenceWorkspaceView,
  type IntakeEvidenceWorkspaceView,
  type IntakePackExecutionSnapshot,
} from "@hiveforyou/shared/intake";

import { readServerEnv } from "@/lib/env/server-env";
import { createSupabaseHiveGateway } from "@/lib/persistence/hive-gateway";
import { SupabaseIntakeRepository } from "@/lib/persistence/supabase-intake";
import {
  SupabaseCaseRepository,
  SupabaseSourceDocumentRepository,
  SupabaseSourceDocumentStorage,
} from "@/lib/persistence/supabase-repositories";
import { emitIntakeRequestedEvent } from "@/lib/intake/emit-intake-requested";
import { isInngestIntakePipeline } from "@/lib/intake/pipeline";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";

const inlineInFlight = new Map<string, Promise<IntakeRunRecord>>();

export class IntakeCaseNotFoundError extends Error {
  readonly code = "CASE_NOT_FOUND";

  constructor() {
    super("Case was not found for the authenticated user.");
    this.name = "IntakeCaseNotFoundError";
  }
}

export class IntakeDocumentNotFoundError extends Error {
  readonly code = "DOCUMENT_NOT_FOUND";

  constructor() {
    super("A source document was not found for the authenticated user.");
    this.name = "IntakeDocumentNotFoundError";
  }
}

export type StartIntakeBody = {
  caseId?: string;
  sourceDocumentIds?: string[];
  rawIntent?: string | null;
  explicitDomainId?: string | null;
};

async function intakePersistence(userId: string) {
  const env = readServerEnv();
  const supabase = await createServerSupabaseClient();
  const gateway = createSupabaseHiveGateway(supabase);
  return {
    cases: new SupabaseCaseRepository(gateway, userId),
    documents: new SupabaseSourceDocumentRepository(gateway, userId),
    storage: new SupabaseSourceDocumentStorage(gateway, env.HIVE_STORAGE_BUCKET, userId),
    intake: new SupabaseIntakeRepository(gateway, userId),
  };
}

async function buildIntakeExecutionDeps(userId: string): Promise<{
  deps: IntakeExecutionDeps;
  documents: SupabaseSourceDocumentRepository;
  intake: SupabaseIntakeRepository;
}> {
  const { documents, storage, intake } = await intakePersistence(userId);
  const deps: IntakeExecutionDeps = {
    runs: intake,
    identities: intake,
    extractions: intake,
    normalizedExtractions: intake,
    inFlight: isInngestIntakePipeline() ? undefined : inlineInFlight,
    loadDocuments: async ({ userId: ownerId, caseId: ownerCaseId, sourceDocumentIds: ids }) => {
      const LOAD_DOCUMENT_CONCURRENCY = 3;
      const loaded = await mapWithConcurrency(ids, LOAD_DOCUMENT_CONCURRENCY, async (sourceDocumentId) => {
        const record = await documents.getById(ownerId, sourceDocumentId);
        if (!record || record.caseId !== ownerCaseId) {
          return null;
        }
        const bytes = await storage.get({
          bucket: record.storageBucket,
          path: record.storagePath,
        });
        return {
          sourceDocumentId: record.id,
          mimeType: record.mimeType,
          sha256: record.sha256,
          bytes,
        } satisfies IntakeSourceDocument;
      });
      return loaded.filter((document): document is IntakeSourceDocument => document !== null);
    },
    decide: (sample) =>
      decideIntakeDocumentIdentity(sample, { classifyLocally: classifyIepDocumentLocally }),
    sourceMetadata: async ({ userId: ownerId, sourceDocumentIds: ids }) => {
      const metadata: Record<string, { filename: string; sourceHash: string }> = {};
      for (const sourceDocumentId of ids) {
        const record = await documents.getById(ownerId, sourceDocumentId);
        if (!record) {
          continue;
        }
        metadata[sourceDocumentId] = {
          filename: record.originalFilename,
          sourceHash: record.sha256,
        };
      }
      return metadata;
    },
    extract: (input) =>
      extractDocument(input, {
        recover: (recoverInput) => recoverNormalizedDocument(recoverInput),
        resolvePageRasterizer: async () => {
          const { createCanvasPageRasterizer } = await import(
            "@hiveforyou/intake-node/canvas-rasterize"
          );
          return createCanvasPageRasterizer();
        },
      }),
  };
  return { deps, documents, intake };
}

export async function startIntakeFromRequest(body: StartIntakeBody): Promise<OpenedIntakeRun> {
  readServerEnv();
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const caseId = body.caseId?.trim() ?? "";
  const sourceDocumentIds = (body.sourceDocumentIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (!caseId || sourceDocumentIds.length === 0) {
    throw new Error("INTAKE_REQUEST_INVALID");
  }

  const { cases, documents } = await intakePersistence(sessionUserId);
  const { deps } = await buildIntakeExecutionDeps(sessionUserId);
  const caseRecord = await cases.getById(sessionUserId, caseId);
  if (!caseRecord) {
    throw new IntakeCaseNotFoundError();
  }
  for (const sourceDocumentId of sourceDocumentIds) {
    const record = await documents.getById(sessionUserId, sourceDocumentId);
    if (!record || record.caseId !== caseId) {
      throw new IntakeDocumentNotFoundError();
    }
  }

  const pipeline = isInngestIntakePipeline() ? "inngest" : "inline";
  const opened = await openIntakeRun(deps, {
    userId: sessionUserId,
    caseId,
    sourceDocumentIds,
    rawIntent: body.rawIntent ?? null,
    explicitDomainId: body.explicitDomainId ?? null,
    initialRunStatus: pipeline === "inngest" ? "QUEUED" : "RUNNING",
  });
  if (pipeline === "inngest") {
    await emitIntakeRequestedEvent(opened.run);
  }
  return opened;
}

export async function readIntakeEvidenceWorkspaceView(
  intakeRunId: string,
): Promise<IntakeEvidenceWorkspaceView | null> {
  readServerEnv();
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const { intake, documents: sourceDocuments } = await intakePersistence(sessionUserId);
  const run = await intake.getById(sessionUserId, intakeRunId);
  if (!run) {
    return null;
  }
  const identities = await intake.listByRun(sessionUserId, intakeRunId);
  const documents = await Promise.all(
    identities.map(async (identity) => {
      const source = await sourceDocuments.getById(sessionUserId, identity.sourceDocumentId);
      let hasNormalizedExtraction = false;
      if (source) {
        const normalized = await intake.getBySourceHash(
          sessionUserId,
          source.id,
          source.sha256,
        );
        hasNormalizedExtraction =
          normalized !== null &&
          normalized.schemaVersion === NORMALIZED_EXTRACTION_SCHEMA_VERSION &&
          normalized.normalizedExtraction.schemaVersion === NORMALIZED_EXTRACTION_SCHEMA_VERSION;
      }
      return {
        sourceDocumentId: identity.sourceDocumentId,
        processingStatus: identity.processingStatus,
        proposedType: identity.proposedType,
        errorCode: identity.errorCode,
        filename: source?.originalFilename ?? "Document",
        sizeBytes: source?.sizeBytes ?? 0,
        mimeType: source?.mimeType ?? null,
        analysisDisposition: identity.analysisDisposition,
        hasNormalizedExtraction,
      };
    }),
  );
  const packExecution: IntakePackExecutionSnapshot | null = run.packExecutionJson
    ? (JSON.parse(run.packExecutionJson) as IntakePackExecutionSnapshot)
    : null;
  const domainManifest = run.resolvedDomainId
    ? getDomainPackManifest(run.resolvedDomainId)
    : null;
  const displayPurpose =
    run.rawIntent?.trim() ||
    (domainManifest ? `Working in ${domainManifest.name}` : "Your documents");

  return toIntakeEvidenceWorkspaceView({
    run: { id: run.id, status: run.status, caseId: run.caseId, startedAt: run.startedAt },
    documents,
    studyPath: run.studyPath ?? "GENERIC_STUDY",
    purpose: {
      rawIntent: run.rawIntent,
      explicitDomainId: run.explicitDomainId,
      resolvedDomainId: run.resolvedDomainId,
      resolutionSource: run.resolutionSource,
      displayPurpose,
      domainName: domainManifest?.name ?? null,
    },
    packExecution,
  });
}

export async function appendSourcesToIntakeRun(
  intakeRunId: string,
  sourceDocumentIds: string[],
): Promise<{ run: IntakeRunRecord; begin: () => Promise<IntakeRunRecord> }> {
  readServerEnv();
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const { deps, documents, intake } = await buildIntakeExecutionDeps(sessionUserId);
  const run = await intake.getById(sessionUserId, intakeRunId);
  if (!run) {
    throw new Error("INTAKE_RUN_NOT_FOUND");
  }
  for (const sourceDocumentId of sourceDocumentIds) {
    const record = await documents.getById(sessionUserId, sourceDocumentId);
    if (!record || record.caseId !== run.caseId) {
      throw new IntakeDocumentNotFoundError();
    }
  }
  const pipeline = isInngestIntakePipeline() ? "inngest" : "inline";
  const opened = await prepareExtendIntakeRun(deps, {
    userId: sessionUserId,
    intakeRunId,
    sourceDocumentIds,
    activeRunStatus: pipeline === "inngest" ? "QUEUED" : "RUNNING",
  });
  if (pipeline === "inngest") {
    await emitIntakeRequestedEvent(opened.run);
  }
  return opened;
}

export async function discardIntakeSourceFromRun(
  intakeRunId: string,
  sourceDocumentId: string,
  disposition: "PRESENT" | "DISCARDED" = "DISCARDED",
): Promise<IntakeEvidenceWorkspaceView | null> {
  readServerEnv();
  const sessionUserId = requireSessionUserId(await getAuthenticatedUserId());
  const { deps } = await buildIntakeExecutionDeps(sessionUserId);
  await setIntakeSourceAnalysisDisposition(deps, {
    userId: sessionUserId,
    intakeRunId,
    sourceDocumentId,
    disposition,
  });
  return readIntakeEvidenceWorkspaceView(intakeRunId);
}

/** @deprecated Use readIntakeEvidenceWorkspaceView */
export async function readIntakeCustomerView(intakeRunId: string) {
  return readIntakeEvidenceWorkspaceView(intakeRunId);
}

export { UnauthenticatedError };
