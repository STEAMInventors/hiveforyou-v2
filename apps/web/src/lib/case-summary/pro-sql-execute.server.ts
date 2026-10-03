import "server-only";

import alasql from "alasql";

import type { ProExportTables } from "@hiveforyou/core/pro-export-tables";
import { PRO_SQL_TABLES, validateSql } from "@hiveforyou/core/pro-validate-sql";

const MAX_ROWS = 5000;

export function executeProSql(
  tables: ProExportTables,
  sql: string,
): { columns: string[]; rows: Record<string, unknown>[] } {
  const err = validateSql(sql);
  if (err) {
    throw new Error(err);
  }
  const cleaned = sql.replace(/;\s*$/, "");
  for (const name of PRO_SQL_TABLES) {
    alasql(`CREATE TABLE ${name}`);
    alasql.tables[name]!.data = [...tables[name]];
  }
  let rows = alasql(cleaned) as Record<string, unknown>[];
  if (!Array.isArray(rows)) {
    rows = [];
  }
  if (rows.length > MAX_ROWS) {
    rows = rows.slice(0, MAX_ROWS);
  }
  const columns = rows.length ? Object.keys(rows[0]!) : [];
  return { columns, rows };
}
