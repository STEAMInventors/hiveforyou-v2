import { randomUUID } from "node:crypto";

import { requireSessionUserId } from "./session-user";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CaseRecord = {
  id: string;
  userId: string;
  domainId: string | null;
  createdAt: string;
  updatedAt: string;
};

export class CaseIdConflictError extends Error {
  readonly code = "CASE_ID_CONFLICT";

  constructor() {
    super("Case id already exists.");
    this.name = "CaseIdConflictError";
  }
}

export class CaseNotAccessibleError extends Error {
  readonly code = "CASE_NOT_ACCESSIBLE";

  constructor() {
    super("Case is not accessible for this account.");
    this.name = "CaseNotAccessibleError";
  }
}

export type HiveDocumentCommitSelectionIntent = "new" | "existing";

export interface CaseRepository {
  getById(userId: string, caseId: string): Promise<CaseRecord | null>;
  listByUserId(userId: string): Promise<CaseRecord[]>;
  create(input: {
    id: string;
    userId: string;
    domainId: string | null;
  }): Promise<CaseRecord>;
  setDomain(userId: string, caseId: string, domainId: string): Promise<void>;
}

export class InMemoryCaseRepository implements CaseRepository {
  private readonly byId = new Map<string, CaseRecord>();

  async getById(userId: string, caseId: string): Promise<CaseRecord | null> {
    const row = this.byId.get(caseId);
    if (!row || row.userId !== userId) {
      return null;
    }
    return structuredClone(row);
  }

  async listByUserId(userId: string): Promise<CaseRecord[]> {
    return [...this.byId.values()]
      .filter((row) => row.userId === userId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((row) => structuredClone(row));
  }

  async create(input: {
    id: string;
    userId: string;
    domainId: string | null;
  }): Promise<CaseRecord> {
    if (this.byId.has(input.id)) {
      throw new CaseIdConflictError();
    }
    const now = new Date().toISOString();
    const row: CaseRecord = {
      id: input.id,
      userId: input.userId,
      domainId: input.domainId,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(row.id, row);
    return structuredClone(row);
  }

  async setDomain(userId: string, caseId: string, domainId: string): Promise<void> {
    const row = this.byId.get(caseId);
    if (!row || row.userId !== userId) {
      return;
    }
    row.domainId = domainId;
    row.updatedAt = new Date().toISOString();
  }
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function resolveCaseForDocumentCommit(
  repo: CaseRepository,
  input: {
    sessionUserId: string | null | undefined;
    requestedCaseId: string;
    selectionIntent: HiveDocumentCommitSelectionIntent;
    createId?: () => string;
  },
): Promise<CaseRecord> {
  const userId = requireSessionUserId(input.sessionUserId);
  const requested = input.requestedCaseId.trim();
  if (!isUuid(requested)) {
    throw new Error("INVALID_CASE_ID");
  }

  const existing = await repo.getById(userId, requested);
  if (input.selectionIntent === "existing") {
    if (!existing) {
      throw new CaseNotAccessibleError();
    }
    return existing;
  }

  if (existing) {
    return existing;
  }

  try {
    return await repo.create({ id: requested, userId, domainId: null });
  } catch (error) {
    if (error instanceof CaseIdConflictError) {
      throw new CaseNotAccessibleError();
    }
    throw error;
  }
}

export async function createOrReuseCase(
  repo: CaseRepository,
  input: {
    sessionUserId: string | null | undefined;
    requestedCaseId?: string | null;
    createId?: () => string;
  },
): Promise<CaseRecord> {
  const userId = requireSessionUserId(input.sessionUserId);
  const createId = input.createId ?? (() => randomUUID());
  const requested = input.requestedCaseId?.trim();
  if (requested && isUuid(requested)) {
    const existing = await repo.getById(userId, requested);
    if (existing) {
      return existing;
    }
    try {
      return await repo.create({ id: requested, userId, domainId: null });
    } catch (error) {
      if (!(error instanceof CaseIdConflictError)) {
        throw error;
      }
    }
  }
  return repo.create({ id: createId(), userId, domainId: null });
}
