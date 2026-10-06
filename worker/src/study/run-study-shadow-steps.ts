import { randomUUID } from "node:crypto";

import type { StudyArtifactRecord } from "@hiveforyou/core";
import {
  shadowAssembleDocument,
  shadowFinalizeCorpus,
  shadowFindingsForUi,
  shadowTier1Document,
} from "@hiveforyou/core/study/shadow/shadow-steps";
import {
  emptyShadowWorkState,
  getShadowDocState,
  upsertShadowDocState,
  type ShadowWorkState,
} from "@hiveforyou/core/study/shadow/shadow-state";
import { v4ClaimsFromValidation } from "@hiveforyou/core/study/shadow/shadow-v4";
import type { CanonicalStudyValidationResultV3 } from "@hiveforyou/shared/case-intelligence/3/validation-result";
import type { NestIepRecoveredPage } from "@hiveforyou/shared/intake";
import { NORMALIZED_EXTRACTION_SCHEMA_VERSION } from "@hiveforyou/shared/intake";

import type { DocumentPagesStorage } from "../intake/document-pages-storage.js";
import type { SupabaseShadowStudyArtifactRepository } from "../persistence/supabase-shadow-study-artifacts.js";
import type { WorkerIntakeRepository } from "../persistence/worker-intake-repository.js";
import type { WorkerSourceDocumentRepository } from "../intake/worker-source-documents.js";
import { ShadowWorkStorage } from "./shadow-work-storage.js";
import { createWorkerCallModel } from "./worker-call-model.js";
import type { WorkerEnv } from "../env.js";

export type ShadowStudyStepRunner = {
  run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
};

export type ShadowStudyContext = {
  userId: string;
  caseId: string;
  studyRunId: string;
  intakeRunId: string;
};

export type ShadowStudyDeps = {
  env: WorkerEnv;
  artifacts: SupabaseShadowStudyArtifactRepository;
  studyArtifact: StudyArtifactRecord | null;
  intake: WorkerIntakeRepository;
  documents: WorkerSourceDocumentRepository;
  documentPages: DocumentPagesStorage;
  shadowWork: ShadowWorkStorage;
};

type ShadowSourceDoc = {
  sourceDocumentId: string;
  sha256: string;
};

function logShadow(payload: Record<string, unknown>): void {
  console.info("[hive/shadow]", JSON.stringify(payload));
}

function isTerminalShadowStatus(status: string): boolean {
  return status === "succeeded" || status === "failed";
}

async function listShadowSourceDocs(
  deps: ShadowStudyDeps,
  ctx: ShadowStudyContext,
): Promise<ShadowSourceDoc[]> {
  const identities = await deps.intake.listByRun(ctx.userId, ctx.intakeRunId);
  const present = identities.filter((row) => row.analysisDisposition !== "DISCARDED");
  const docs: ShadowSourceDoc[] = [];
  for (const identity of present) {
    const record = await deps.documents.getById(ctx.userId, identity.sourceDocumentId);
    if (!record) {
      continue;
    }
    docs.push({ sourceDocumentId: record.id, sha256: record.sha256 });
  }
  return docs;
}

async function loadRecoveredPages(
  deps: ShadowStudyDeps,
  userId: string,
  sourceDocumentId: string,
  sourceHash: string,
): Promise<NestIepRecoveredPage[]> {
  const normalized = await deps.intake.getBySourceHash(userId, sourceDocumentId, sourceHash);
  if (
    !normalized ||
    normalized.schemaVersion !== NORMALIZED_EXTRACTION_SCHEMA_VERSION ||
    normalized.normalizedExtraction.schemaVersion !== NORMALIZED_EXTRACTION_SCHEMA_VERSION
  ) {
    return [];
  }
  return normalized.normalizedExtraction.pages;
}

export async function runStudyShadowPipeline(input: {
  deps: ShadowStudyDeps;
  ctx: ShadowStudyContext;
  step: ShadowStudyStepRunner;
}): Promise<{ skipped: string } | { done: true }> {
  const { deps, ctx, step } = input;
  const stepMs: Record<string, number> = {};

  async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      stepMs[name] = Math.round(performance.now() - start);
    }
  }

  const existing = await deps.artifacts.getByStudyRunId(ctx.studyRunId);
  if (existing && isTerminalShadowStatus(existing.status)) {
    return { skipped: "shadow-terminal" };
  }

  const validation = deps.studyArtifact?.validationResultJson as
    | CanonicalStudyValidationResultV3
    | undefined;
  if (!validation) {
    return { skipped: "shadow-no-validation" };
  }

  const modelBundle = createWorkerCallModel(deps.env as Record<string, string | undefined>);
  if (!modelBundle) {
    await deps.artifacts.insertRunning({
      id: randomUUID(),
      caseId: ctx.caseId,
      studyRunId: ctx.studyRunId,
      userId: ctx.userId,
      startedAt: new Date().toISOString(),
    });
    await deps.artifacts.markFailed(ctx.studyRunId, "shadow-init");
    logShadow({
      studyRunId: ctx.studyRunId,
      status: "failed",
      failedStep: "shadow-init",
      reason: "MODEL_UNAVAILABLE",
      stepMs,
    });
    return { done: true };
  }

  const sourceDocs = await listShadowSourceDocs(deps, ctx);
  const v4Claims = v4ClaimsFromValidation(validation);
  const sourceIdToDocumentId = new Map(
    sourceDocs.map((d) => [d.sourceDocumentId, d.sourceDocumentId]),
  );

  let state =
    (await deps.shadowWork.load(ctx.userId, ctx.studyRunId)) ??
    emptyShadowWorkState(ctx.studyRunId);

  await step.run("shadow-init", async () =>
    timed("shadow-init", async () => {
      if (!existing) {
        await deps.artifacts.insertRunning({
          id: randomUUID(),
          caseId: ctx.caseId,
          studyRunId: ctx.studyRunId,
          userId: ctx.userId,
          startedAt: new Date().toISOString(),
        });
      }
      if (state.documents.length === 0) {
        state = {
          ...state,
          documents: sourceDocs.map((d) => ({
            sourceDocumentId: d.sourceDocumentId,
            documentId: d.sourceDocumentId,
          })),
        };
        await deps.shadowWork.save(ctx.userId, state);
      }
      return { ok: true };
    }).catch(async (error) => {
      await deps.artifacts.markFailed(ctx.studyRunId, "shadow-init");
      logShadow({
        studyRunId: ctx.studyRunId,
        status: "failed",
        failedStep: "shadow-init",
        errorKind: error instanceof Error ? error.name : "Error",
        stepMs,
      });
      return { ok: false };
    }),
  );

  async function shadowAlreadyFailed(): Promise<boolean> {
    const row = await deps.artifacts.getByStudyRunId(ctx.studyRunId);
    return row?.status === "failed";
  }

  for (const doc of sourceDocs) {
    if (await shadowAlreadyFailed()) {
      break;
    }
    const stepId = `shadow-assemble-${doc.sourceDocumentId}`;
    await step.run(stepId, async () =>
      timed(stepId, async () => {
        state = (await deps.shadowWork.load(ctx.userId, ctx.studyRunId)) ?? state;
        const work = getShadowDocState(state, doc.sourceDocumentId);
        if (work?.tier0Statements) {
          return { skipped: true };
        }
        const source = await deps.documents.loadIntakeSource(
          ctx.userId,
          ctx.caseId,
          doc.sourceDocumentId,
        );
        if (!source) {
          throw new Error("SOURCE_MISSING");
        }
        const documentPages = await deps.documentPages.loadOrRebuild({
          userId: ctx.userId,
          sha256: doc.sha256,
          sourceDocumentId: doc.sourceDocumentId,
          bytes: source.bytes,
        });
        const { tier0Statements, things } = shadowAssembleDocument(documentPages);
        state = upsertShadowDocState(state, {
          sourceDocumentId: doc.sourceDocumentId,
          documentId: doc.sourceDocumentId,
          tier0Statements,
          things,
        });
        await deps.shadowWork.save(ctx.userId, state);
        return { ok: true };
      }).catch(async (error) => {
        await deps.artifacts.markFailed(ctx.studyRunId, stepId);
        logShadow({
          studyRunId: ctx.studyRunId,
          status: "failed",
          failedStep: stepId,
          errorKind: error instanceof Error ? error.name : "Error",
          stepMs,
        });
        return { ok: false };
      }),
    );
  }

  for (const doc of sourceDocs) {
    if (await shadowAlreadyFailed()) {
      break;
    }
    const stepId = `shadow-tier1-${doc.sourceDocumentId}`;
    await step.run(stepId, async () =>
      timed(stepId, async () => {
        state = (await deps.shadowWork.load(ctx.userId, ctx.studyRunId)) ?? state;
        const work = getShadowDocState(state, doc.sourceDocumentId);
        if (work?.tier1) {
          return { skipped: true };
        }
        const source = await deps.documents.loadIntakeSource(
          ctx.userId,
          ctx.caseId,
          doc.sourceDocumentId,
        );
        if (!source) {
          throw new Error("SOURCE_MISSING");
        }
        const documentPages = await deps.documentPages.loadOrRebuild({
          userId: ctx.userId,
          sha256: doc.sha256,
          sourceDocumentId: doc.sourceDocumentId,
          bytes: source.bytes,
        });
        const { assembled } = shadowAssembleDocument(documentPages);
        const tier1 = await shadowTier1Document({
          assembled,
          callModel: modelBundle.callModel,
          model: modelBundle.modelName,
        });
        state = upsertShadowDocState(state, {
          ...(work ?? {
            sourceDocumentId: doc.sourceDocumentId,
            documentId: doc.sourceDocumentId,
          }),
          tier1,
        });
        await deps.shadowWork.save(ctx.userId, state);
        return { ok: true };
      }).catch(async (error) => {
        await deps.artifacts.markFailed(ctx.studyRunId, stepId);
        logShadow({
          studyRunId: ctx.studyRunId,
          status: "failed",
          failedStep: stepId,
          errorKind: error instanceof Error ? error.name : "Error",
          stepMs,
        });
        return { ok: false };
      }),
    );
  }

  if (!(await shadowAlreadyFailed())) {
    await step.run("shadow-study", async () =>
      timed("shadow-study", async () => {
        state = (await deps.shadowWork.load(ctx.userId, ctx.studyRunId)) ?? state;
        for (const doc of sourceDocs) {
          const work = getShadowDocState(state, doc.sourceDocumentId);
          if (!work?.tier0Statements || !work.tier1) {
            throw new Error("SHADOW_DOC_INCOMPLETE");
          }
        }
        return { ok: true };
      }).catch(async (error) => {
        await deps.artifacts.markFailed(ctx.studyRunId, "shadow-study");
        logShadow({
          studyRunId: ctx.studyRunId,
          status: "failed",
          failedStep: "shadow-study",
          errorKind: error instanceof Error ? error.name : "Error",
          stepMs,
        });
        return { ok: false };
      }),
    );
  }

  if (await shadowAlreadyFailed()) {
    return { done: true };
  }

  await step.run("shadow-save", async () =>
    timed("shadow-save", async () => {
      state = (await deps.shadowWork.load(ctx.userId, ctx.studyRunId)) ?? state;
      const corpusDocs = [];
      for (const doc of sourceDocs) {
        const work = getShadowDocState(state, doc.sourceDocumentId);
        if (!work?.tier0Statements || !work.tier1) {
          throw new Error("SHADOW_DOC_INCOMPLETE");
        }
        const source = await deps.documents.loadIntakeSource(
          ctx.userId,
          ctx.caseId,
          doc.sourceDocumentId,
        );
        if (!source) {
          throw new Error("SOURCE_MISSING");
        }
        const pages = await deps.documentPages.loadOrRebuild({
          userId: ctx.userId,
          sha256: doc.sha256,
          sourceDocumentId: doc.sourceDocumentId,
          bytes: source.bytes,
        });
        const recoveredPages = await loadRecoveredPages(
          deps,
          ctx.userId,
          doc.sourceDocumentId,
          doc.sha256,
        );
        corpusDocs.push({ pages, recoveredPages, work });
      }
      const finalized = shadowFinalizeCorpus({
        documents: corpusDocs,
        v4Claims,
        sourceIdToDocumentId,
      });
      const findings = shadowFindingsForUi(finalized.findings, finalized.statements);
      const multiSourceFacts = finalized.findings.filter(
        (f) => f.kind === "fact" && f.statementIds.length > 1,
      ).length;
      const factsCount = finalized.findings.filter((f) => f.kind === "fact").length;
      const coverage = finalized.coverage
        ? {
            covered: finalized.coverage.coveredClaims,
            total: finalized.coverage.totalClaims,
            uncoveredClaims: finalized.coverage.uncoveredClaims.map((c) => ({
              claimId: c.claimId,
              primarySnippet: c.primarySnippet,
            })),
          }
        : null;

      await deps.artifacts.markSucceeded(ctx.studyRunId, {
        findingsJson: findings,
        statementsCount: finalized.statements.length,
        factsCount,
        multiSourceFactsCount: multiSourceFacts,
        coverageJson: coverage,
        dropsJson: finalized.validationDrops,
        tokenUsageJson: finalized.usage,
      });

      await deps.shadowWork.remove(ctx.userId, ctx.studyRunId);

      const findingsByKind = finalized.findings.reduce<Record<string, number>>((acc, f) => {
        acc[f.kind] = (acc[f.kind] ?? 0) + 1;
        return acc;
      }, {});

      logShadow({
        studyRunId: ctx.studyRunId,
        status: "succeeded",
        coverage: coverage ? `${coverage.covered}/${coverage.total}` : null,
        uncoveredClaimIds: coverage?.uncoveredClaims.map((c) => c.claimId) ?? [],
        findingsByKind,
        multiSourceFacts,
        dropsByReason: finalized.validationDrops,
        tier1Tokens: finalized.usage,
        stepMs,
      });
      return { ok: true };
    }).catch(async (error) => {
      await deps.artifacts.markFailed(ctx.studyRunId, "shadow-save");
      logShadow({
        studyRunId: ctx.studyRunId,
        status: "failed",
        failedStep: "shadow-save",
        errorKind: error instanceof Error ? error.name : "Error",
        stepMs,
      });
      return { ok: false };
    }),
  );

  return { done: true };
}

export function isStudyShadowEnabled(env: WorkerEnv): boolean {
  const raw = (env as Record<string, string | undefined>).HIVE_STUDY_SHADOW?.trim().toLowerCase();
  return raw === "on" || raw === "1" || raw === "true";
}
