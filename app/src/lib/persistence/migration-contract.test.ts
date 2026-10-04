import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "../supabase/migrations/20260927220000_hive_persistence.sql"),
  "utf8",
);

describe("hive persistence migration", () => {
  it("creates private storage, owned tables, and append-only study records", () => {
    for (const table of [
      "hive.cases",
      "hive.source_documents",
      "hive.study_runs",
      "hive.study_contexts",
      "hive.study_run_events",
      "hive.case_intelligence_snapshots",
      "hive.answer_snapshots",
    ]) {
      expect(sql).toContain(`create table if not exists ${table}`);
      expect(sql).toContain(`alter table ${table} enable row level security`);
    }
    expect(sql).toContain("unique (case_id, idempotency_key)");
    expect(sql).toContain("unique (case_id, version)");
    expect(sql).toContain("prompt_version <> 'latest'");
    expect(sql).toContain("values ('case-documents', 'case-documents', false)");
    expect(sql).toContain("(storage.foldername(name))[1] = auth.uid()::text");
    expect(sql).toContain("using (user_id = auth.uid())");
    expect(sql).toContain("with check (user_id = auth.uid())");
    expect(sql).toContain("before update or delete on hive.study_contexts");
    expect(sql).toContain("before update or delete on hive.study_run_events");
    expect(sql).toContain("before update or delete on hive.case_intelligence_snapshots");
    expect(sql).not.toContain("policy study_contexts_update");
    expect(sql).not.toContain("policy case_intelligence_update");
    expect(sql).not.toContain("policy study_run_events_update");
  });
});
