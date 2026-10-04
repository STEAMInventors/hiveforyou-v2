import { randomUUID } from "node:crypto";

import { withSessionOwner } from "@hiveforyou/core";
import type {
  CaseProjectionKind,
  CaseProjectionRepository,
} from "@hiveforyou/core";
import type { CaseMap, CaseViewV2, CustomerView, ProView } from "@hiveforyou/shared/projections";

import type { HiveGateway, HiveRow } from "./hive-gateway";

function text(row: HiveRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be text.`);
  }
  return value;
}

export class SupabaseCaseProjectionRepository implements CaseProjectionRepository {
  constructor(
    private readonly gateway: HiveGateway,
    private readonly userId: string,
  ) {}

  async save(record: {
    caseId: string;
    intelligenceVersion: number;
    projectionKind: CaseProjectionKind;
    schemaVersion: string;
    projection: CustomerView | ProView | CaseMap | CaseViewV2;
  }): Promise<void> {
    const existing = await this.getByVersionAndKind(
      record.caseId,
      record.intelligenceVersion,
      record.projectionKind,
    );
    if (existing) {
      // Projections are insert-only in Supabase (reject_mutation trigger on update/delete).
      return;
    }
    await this.gateway.insert(
      "case_projections",
      withSessionOwner(this.userId, {
        id: randomUUID(),
        case_id: record.caseId,
        user_id: this.userId,
        intelligence_version: record.intelligenceVersion,
        projection_kind: record.projectionKind,
        schema_version: record.schemaVersion,
        projection_json: record.projection,
        created_at: new Date().toISOString(),
      }),
    );
  }

  async getByVersionAndKind(
    caseId: string,
    intelligenceVersion: number,
    projectionKind: CaseProjectionKind,
  ): Promise<CustomerView | ProView | CaseMap | CaseViewV2 | null> {
    const rows = await this.gateway.selectWhere(
      "case_projections",
      {
        case_id: caseId,
        user_id: this.userId,
        intelligence_version: intelligenceVersion,
        projection_kind: projectionKind,
      },
      { orderBy: "created_at", ascending: false, limit: 1 },
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return row.projection_json as CustomerView | ProView | CaseMap | CaseViewV2;
  }

  async getLatestVersion(caseId: string): Promise<number | null> {
    const rows = await this.gateway.selectWhere(
      "case_projections",
      { case_id: caseId, user_id: this.userId },
      { orderBy: "intelligence_version", ascending: false, limit: 1 },
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return Number(row.intelligence_version);
  }
}

export async function loadLatestStructureMapForCase(
  gateway: HiveGateway,
  userId: string,
  caseId: string,
): Promise<import("@hiveforyou/shared/discover/structure-map").StructureMap | null> {
  const rows = await gateway.selectWhere(
    "discover_artifacts",
    { case_id: caseId, user_id: userId },
    { orderBy: "created_at", ascending: false, limit: 12 },
  );
  for (const row of rows) {
    const map = row.structure_map_json;
    if (map && typeof map === "object") {
      return map as import("@hiveforyou/shared/discover/structure-map").StructureMap;
    }
  }
  return null;
}

export function mapProjectionRowKind(row: HiveRow): CaseProjectionKind {
  const kind = text(row, "projection_kind");
  if (kind !== "customer" && kind !== "pro" && kind !== "case_map" && kind !== "case_view") {
    throw new Error("Unknown projection kind.");
  }
  return kind;
}
