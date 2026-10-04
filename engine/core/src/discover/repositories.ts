import type { HiveDiscoverRun } from "@hiveforyou/shared/discover";

export interface DiscoverRunRepository {
  /** Persists the run; returns the canonical row identity (stable id after idempotency races). */
  save(run: HiveDiscoverRun): Promise<HiveDiscoverRun>;
  getByDiscoverRunId(discoverRunId: string): Promise<HiveDiscoverRun | null>;
  getByIdempotencyKey(
    caseId: string,
    idempotencyKey: string,
  ): Promise<HiveDiscoverRun | null>;
}

export class InMemoryDiscoverRunRepository implements DiscoverRunRepository {
  private readonly byRunId = new Map<string, HiveDiscoverRun>();
  private readonly byIdempotency = new Map<string, HiveDiscoverRun>();

  async save(run: HiveDiscoverRun): Promise<HiveDiscoverRun> {
    const idempotencyLookup = `${run.caseId}:${run.idempotencyKey}`;
    const previous = this.byIdempotency.get(idempotencyLookup);
    const persisted: HiveDiscoverRun = previous
      ? {
          ...run,
          discoverRunId: previous.discoverRunId,
          startedAt: previous.startedAt,
        }
      : structuredClone(run);
    if (previous && previous.discoverRunId !== persisted.discoverRunId) {
      this.byRunId.delete(previous.discoverRunId);
    }
    const copy = structuredClone(persisted);
    this.byRunId.set(persisted.discoverRunId, copy);
    this.byIdempotency.set(idempotencyLookup, copy);
    return persisted;
  }

  async getByDiscoverRunId(discoverRunId: string): Promise<HiveDiscoverRun | null> {
    return this.byRunId.get(discoverRunId) ?? null;
  }

  async getByIdempotencyKey(
    caseId: string,
    idempotencyKey: string,
  ): Promise<HiveDiscoverRun | null> {
    return this.byIdempotency.get(`${caseId}:${idempotencyKey}`) ?? null;
  }
}

export type DiscoverArtifactRecord = {
  discoverRunId: string;
  caseId: string;
  userId: string;
  rawProposalJson?: unknown;
  validationResultJson?: unknown;
  discoveryResultJson?: unknown;
  structureMapJson?: unknown;
  discoveryAssessmentJson?: unknown;
  resolutionProposalJson?: unknown;
};

export interface DiscoverArtifactRepository {
  save(input: DiscoverArtifactRecord): Promise<void>;
  getByDiscoverRunId(discoverRunId: string): Promise<DiscoverArtifactRecord | null>;
}

export class InMemoryDiscoverArtifactRepository implements DiscoverArtifactRepository {
  private readonly byRunId = new Map<string, DiscoverArtifactRecord>();

  get artifacts(): DiscoverArtifactRecord[] {
    return [...this.byRunId.values()];
  }

  async save(input: DiscoverArtifactRecord): Promise<void> {
    const existing = this.byRunId.get(input.discoverRunId);
    this.byRunId.set(
      input.discoverRunId,
      structuredClone({
        ...existing,
        ...input,
        discoverRunId: input.discoverRunId,
        caseId: input.caseId,
        userId: input.userId,
      }),
    );
  }

  async getByDiscoverRunId(discoverRunId: string): Promise<DiscoverArtifactRecord | null> {
    const record = this.byRunId.get(discoverRunId);
    return record ? structuredClone(record) : null;
  }
}
