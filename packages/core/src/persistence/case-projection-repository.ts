import type { CustomerView, ProView } from "@hiveforyou/shared/projections";

export type CaseProjectionKind = "customer" | "pro";

export type CaseProjectionRecord = {
  caseId: string;
  intelligenceVersion: number;
  projectionKind: CaseProjectionKind;
  schemaVersion: string;
  projection: CustomerView | ProView;
};

export interface CaseProjectionRepository {
  save(record: CaseProjectionRecord): Promise<void>;
  getByVersionAndKind(
    caseId: string,
    intelligenceVersion: number,
    projectionKind: CaseProjectionKind,
  ): Promise<CustomerView | ProView | null>;
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
      throw new Error("CASE_PROJECTION_EXISTS");
    }
    this.rows.push(structuredClone(record));
  }

  async getByVersionAndKind(
    caseId: string,
    intelligenceVersion: number,
    projectionKind: CaseProjectionKind,
  ): Promise<CustomerView | ProView | null> {
    const row = this.rows.find(
      (item) =>
        item.caseId === caseId &&
        item.intelligenceVersion === intelligenceVersion &&
        item.projectionKind === projectionKind,
    );
    return row ? structuredClone(row.projection) : null;
  }
}
