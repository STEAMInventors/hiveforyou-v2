import { randomUUID } from "node:crypto";

import type { CaseCustomerContextRepository } from "@hiveforyou/core";
import { withSessionOwner } from "@hiveforyou/core";
import type {
  CaseCustomerContextRecord,
  CaseCustomerContextType,
  CaseCustomerContextValueJson,
} from "@hiveforyou/shared/case-customer-context";
import { CASE_CUSTOMER_CONTEXT_SOURCE } from "@hiveforyou/shared/case-customer-context";

import type { HiveGateway, HiveRow } from "./hive-gateway";

function text(row: HiveRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be text.`);
  }
  return value;
}

function mapRow(row: Record<string, unknown>): CaseCustomerContextRecord {
  return {
    id: text(row, "id"),
    userId: text(row, "user_id"),
    caseId: text(row, "case_id"),
    domainId: text(row, "domain_id"),
    contextType: text(row, "context_type") as CaseCustomerContextType,
    valueJson: row.value_json as CaseCustomerContextValueJson,
    source: CASE_CUSTOMER_CONTEXT_SOURCE,
    createdAt: text(row, "created_at"),
    supersededAt: row.superseded_at == null ? null : text(row, "superseded_at"),
  };
}

export class SupabaseCaseCustomerContextRepository implements CaseCustomerContextRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async getActiveByCaseAndType(
    caseId: string,
    contextType: CaseCustomerContextType,
    domainId: string,
  ): Promise<CaseCustomerContextRecord | null> {
    const rows = await this.gateway.selectWhere(
      "case_customer_context",
      {
        user_id: this.userId,
        case_id: caseId,
        domain_id: domainId,
        context_type: contextType,
      },
      { orderBy: "created_at", ascending: false, limit: 20 },
    );
    const active = rows.find((row) => row.superseded_at == null);
    return active ? mapRow(active) : null;
  }

  async listActiveByCase(caseId: string): Promise<CaseCustomerContextRecord[]> {
    const rows = await this.gateway.selectWhere(
      "case_customer_context",
      { user_id: this.userId, case_id: caseId },
      { orderBy: "created_at", ascending: true },
    );
    return rows.filter((row) => row.superseded_at == null).map(mapRow);
  }

  async supersedeActive(input: {
    userId: string;
    caseId: string;
    domainId: string;
    contextType: CaseCustomerContextType;
    now?: string;
  }): Promise<void> {
    const active = await this.getActiveByCaseAndType(
      input.caseId,
      input.contextType,
      input.domainId,
    );
    if (!active) {
      return;
    }
    const now = input.now ?? new Date().toISOString();
    await this.gateway.updateWhere(
      "case_customer_context",
      { superseded_at: now },
      { id: active.id, user_id: input.userId },
    );
  }

  async supersedeAndInsert(input: {
    userId: string;
    caseId: string;
    domainId: string;
    contextType: CaseCustomerContextType;
    valueJson: CaseCustomerContextValueJson;
    now?: string;
  }): Promise<CaseCustomerContextRecord> {
    const now = input.now ?? new Date().toISOString();
    await this.supersedeActive({
      userId: input.userId,
      caseId: input.caseId,
      domainId: input.domainId,
      contextType: input.contextType,
      now,
    });
    const id = randomUUID();
    const record: CaseCustomerContextRecord = {
      id,
      userId: input.userId,
      caseId: input.caseId,
      domainId: input.domainId,
      contextType: input.contextType,
      valueJson: input.valueJson,
      source: CASE_CUSTOMER_CONTEXT_SOURCE,
      createdAt: now,
      supersededAt: null,
    };
    await this.gateway.insert(
      "case_customer_context",
      withSessionOwner(this.userId, {
        id: record.id,
        case_id: record.caseId,
        domain_id: record.domainId,
        context_type: record.contextType,
        value_json: record.valueJson,
        source: record.source,
        created_at: record.createdAt,
        superseded_at: null,
      }),
    );
    return record;
  }
}
