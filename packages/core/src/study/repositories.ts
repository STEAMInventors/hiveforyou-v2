import type { CanonicalStudyContext } from "@hiveforyou/shared/canonical-study";
import type { CanonicalStudyRun } from "@hiveforyou/shared/canonical-study";

import { hashCanonicalJson } from "./fingerprint";

export interface StudyContextRepository {
  save(context: CanonicalStudyContext): Promise<void>;
  getByStudyRunId(studyRunId: string): Promise<CanonicalStudyContext | null>;
  getByIdempotencyKey(
    caseId: string,
    idempotencyKey: string,
  ): Promise<CanonicalStudyContext | null>;
}

export class InMemoryStudyContextRepository implements StudyContextRepository {
  private readonly byRunId = new Map<string, CanonicalStudyContext>();
  private readonly byIdempotency = new Map<string, CanonicalStudyContext>();

  async save(context: CanonicalStudyContext): Promise<void> {
    const frozen = structuredClone(context);
    const existing = this.byRunId.get(context.studyRunId);
    if (existing) {
      if (hashCanonicalJson(existing) !== hashCanonicalJson(frozen)) {
        throw new Error("STUDY_CONTEXT_IMMUTABLE");
      }
      return;
    }
    this.byRunId.set(context.studyRunId, frozen);
    this.byIdempotency.set(
      `${context.caseId}:${context.idempotencyKey}`,
      frozen,
    );
  }

  async getByStudyRunId(studyRunId: string): Promise<CanonicalStudyContext | null> {
    return this.byRunId.get(studyRunId) ?? null;
  }

  async getByIdempotencyKey(
    caseId: string,
    idempotencyKey: string,
  ): Promise<CanonicalStudyContext | null> {
    return this.byIdempotency.get(`${caseId}:${idempotencyKey}`) ?? null;
  }
}

export interface StudyRunRepository {
  /** Persists the run; returns the canonical row identity (stable id after idempotency races). */
  save(run: CanonicalStudyRun): Promise<CanonicalStudyRun>;
  getByStudyRunId(studyRunId: string): Promise<CanonicalStudyRun | null>;
  getByIdempotencyKey(
    caseId: string,
    idempotencyKey: string,
  ): Promise<CanonicalStudyRun | null>;
}

export class InMemoryStudyRunRepository implements StudyRunRepository {
  private readonly byRunId = new Map<string, CanonicalStudyRun>();
  private readonly byIdempotency = new Map<string, CanonicalStudyRun>();

  async save(run: CanonicalStudyRun): Promise<CanonicalStudyRun> {
    const idempotencyLookup = `${run.caseId}:${run.idempotencyKey}`;
    const previous = this.byIdempotency.get(idempotencyLookup);
    if (
      previous?.status === "RUNNING" &&
      run.status === "RUNNING" &&
      previous.studyRunId !== run.studyRunId
    ) {
      return structuredClone(previous);
    }
    const persisted: CanonicalStudyRun = previous
      ? {
          ...run,
          studyRunId: previous.studyRunId,
          startedAt: previous.startedAt,
        }
      : structuredClone(run);
    if (previous && previous.studyRunId !== persisted.studyRunId) {
      this.byRunId.delete(previous.studyRunId);
    }
    const copy = structuredClone(persisted);
    this.byRunId.set(persisted.studyRunId, copy);
    this.byIdempotency.set(idempotencyLookup, copy);
    return persisted;
  }

  async getByStudyRunId(studyRunId: string): Promise<CanonicalStudyRun | null> {
    return this.byRunId.get(studyRunId) ?? null;
  }

  async getByIdempotencyKey(
    caseId: string,
    idempotencyKey: string,
  ): Promise<CanonicalStudyRun | null> {
    return this.byIdempotency.get(`${caseId}:${idempotencyKey}`) ?? null;
  }
}
