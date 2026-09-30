import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";

import type { CaseIntelligenceSnapshot } from "./case-intelligence";

export type PersistedCaseIntelligence = CaseIntelligenceSnapshot | CanonicalCaseSnapshot;

export interface CaseIntelligenceRepository {
  getLatestVersion(caseId: string): Promise<number | null>;
  save(snapshot: PersistedCaseIntelligence): Promise<void>;
  getByVersion(
    caseId: string,
    version: number,
  ): Promise<PersistedCaseIntelligence | null>;
}
export class InMemoryCaseIntelligenceRepository
  implements CaseIntelligenceRepository
{
  private readonly byCase = new Map<string, PersistedCaseIntelligence[]>();

  async getLatestVersion(caseId: string): Promise<number | null> {
    const list = this.byCase.get(caseId);
    if (!list?.length) {
      return null;
    }
    return list.at(-1)!.version;
  }

  async save(snapshot: PersistedCaseIntelligence): Promise<void> {
    const list = this.byCase.get(snapshot.caseId) ?? [];
    if (list.some((existing) => existing.version === snapshot.version)) {
      throw new Error("CASE_INTELLIGENCE_VERSION_EXISTS");
    }
    list.push(JSON.parse(JSON.stringify(snapshot)) as PersistedCaseIntelligence);
    this.byCase.set(snapshot.caseId, list);
  }

  async getByVersion(
    caseId: string,
    version: number,
  ): Promise<PersistedCaseIntelligence | null> {
    const list = this.byCase.get(caseId);
    return list?.find((s) => s.version === version) ?? null;
  }
}
