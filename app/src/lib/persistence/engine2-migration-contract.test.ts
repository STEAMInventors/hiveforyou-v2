import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "../supabase/migrations/20260928180000_engine2_study_artifacts_projections.sql",
  ),
  "utf8",
);
const caseMapSql = readFileSync(
  join(process.cwd(), "../supabase/migrations/20261002150000_case_projections_case_map.sql"),
  "utf8",
);
const caseViewSql = readFileSync(
  join(process.cwd(), "../supabase/migrations/20261002200000_case_projections_case_view.sql"),
  "utf8",
);

describe("engine2 study artifacts + projections migration", () => {
  it("creates append-only study_artifacts and case_projections with RLS", () => {
    for (const table of ["hive.study_artifacts", "hive.case_projections"]) {
      expect(sql).toContain(`create table if not exists ${table}`);
      expect(sql).toContain(`alter table ${table} enable row level security`);
      expect(sql).toContain(`before update or delete on ${table}`);
    }
    expect(sql).toContain("unique (case_id, intelligence_version, projection_kind)");
    expect(sql).toContain("references hive.study_runs (id)");
  });

  it("allows case_map projection kind", () => {
    expect(caseMapSql).toContain("'case_map'");
  });

  it("allows case_view projection kind", () => {
    expect(caseViewSql).toContain("'case_view'");
  });
});
