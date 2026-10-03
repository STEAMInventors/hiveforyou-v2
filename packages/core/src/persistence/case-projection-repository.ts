import type { CaseMap, CaseViewV2, CustomerView, ProView } from "@hiveforyou/shared/projections";

export type CaseProjectionKind = "customer" | "pro" | "case_map" | "case_view";

export type CaseProjectionRecord = {
  caseId: string;
  intelligenceVersion: number;
  projectionKind: CaseProjectionKind;
  schemaVersion: string;
  projection: CustomerView | ProView | CaseMap | CaseViewV2;
};

export interface CaseProjectionRepository {
  save(record: CaseProjectionRecord): Promise<void>;
  getByVersionAndKind(
    caseId: string,
    intelligenceVersion: number,
    projectionKind: CaseProjectionKind,
  ): Promise<CustomerView | ProView | CaseMap | CaseViewV2 | null>;
}

export class InMemoryCaseProjectionRepository implements CaseProjectionRepository {
  private readonly rows: CaseProjectionRecord[] = [];

  async save(record: CaseProjectionRecord): Promise<void> {
    const existing = this.rows.find(
      (row) =>
        row.caseId === record.caseId &&
        row.intelligenceVersion === record.intelligenceVersion &&
        row.projectionKind === record.projectionKind,
    );
    if (existing) {
      return;
    }
    this.rows.push(structuredClone(record));
  }

  async getByVersionAndKind(
    caseId: string,
    intelligenceVersion: number,
    projectionKind: CaseProjectionKind,
  ): Promise<CustomerView | ProView | CaseMap | CaseViewV2 | null> {
    const row = this.rows.find(
      (item) =>
        item.caseId === caseId &&
        item.intelligenceVersion === intelligenceVersion &&
        item.projectionKind === projectionKind,
    );
    return row ? structuredClone(row.projection) : null;
  }
}
