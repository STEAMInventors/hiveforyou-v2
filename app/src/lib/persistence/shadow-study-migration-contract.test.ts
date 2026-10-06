import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "../supabase/migrations/20261006140000_shadow_study_artifacts.sql"),
  "utf8",
);

describe("shadow study artifacts migration", () => {
  it("creates shadow_study_artifacts with select-only RLS for authenticated", () => {
    expect(sql).toContain("create table if not exists hive.shadow_study_artifacts");
    expect(sql).toContain("alter table hive.shadow_study_artifacts enable row level security");
    expect(sql).toContain("grant select on hive.shadow_study_artifacts to authenticated");
    expect(sql).toContain("grant all on hive.shadow_study_artifacts to service_role");
    expect(sql).not.toContain("grant insert on hive.shadow_study_artifacts to authenticated");
    expect(sql).toContain("study_run_id uuid not null unique");
  });

  it("creates private document-pages bucket", () => {
    expect(sql).toContain("'document-pages'");
    expect(sql).toContain("document_pages_select_own");
  });
});
