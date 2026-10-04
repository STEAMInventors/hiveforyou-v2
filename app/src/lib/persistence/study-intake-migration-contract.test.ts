import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "../supabase/migrations/20261002140000_study_runs_intake_run.sql"),
  "utf8",
);

describe("study runs intake_run_id migration", () => {
  it("links study_runs to intake_runs", () => {
    expect(sql).toContain("alter table hive.study_runs");
    expect(sql).toContain("intake_run_id uuid references hive.intake_runs");
    expect(sql).toContain("study_runs_intake_run_idx");
  });
});
