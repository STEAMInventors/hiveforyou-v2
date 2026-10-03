import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "../../supabase/migrations/20260930130000_intake_document_identity.sql"),
  "utf8",
);

const classifierVersionNullableSql = readFileSync(
  join(
    process.cwd(),
    "../../supabase/migrations/20260930140000_intake_runs_classifier_version_nullable.sql",
  ),
  "utf8",
);

const normalizedSql = readFileSync(
  join(process.cwd(), "../../supabase/migrations/20260930180000_document_normalized_extractions.sql"),
  "utf8",
);

const adapter = readFileSync(join(process.cwd(), "src/lib/persistence/supabase-intake.ts"), "utf8");

describe("intake document identity migration", () => {
  it("keeps run membership on document identities and page provenance on extractions", () => {
    expect(sql).toContain("create table if not exists hive.intake_runs");
    expect(sql).toContain("create table if not exists hive.document_identities");
    expect(sql).toContain("create table if not exists hive.document_extractions");
    expect(sql).toContain("unique (intake_run_id, source_document_id)");
    expect(sql).toContain(
      "unique (source_document_id, page_number, extraction_method, source_hash)",
    );
    expect(sql).toContain("bounding_boxes jsonb");
    expect(sql).toContain("alter table hive.intake_runs enable row level security");
    expect(sql).toContain("alter table hive.document_identities enable row level security");
    expect(sql).toContain("alter table hive.document_extractions enable row level security");
    expect(sql).toContain("using (user_id = auth.uid())");
    expect(sql).not.toContain("source_documents_intake_run_id_fkey");
    expect(sql).not.toContain("update hive.source_documents");
  });

  it("does not treat source_documents.intake_run_id as ownership", () => {
    expect(adapter).not.toContain("source_documents");
  });

  it("persists full normalized extraction once per source document hash", () => {
    expect(normalizedSql).toContain("create table if not exists hive.document_normalized_extractions");
    expect(normalizedSql).toContain("normalized_extraction jsonb not null");
    expect(normalizedSql).toContain("unique (source_document_id, source_hash)");
    expect(adapter).toContain("document_normalized_extractions");
  });

  it("allows nullable classifier_version on intake runs via follow-up migration", () => {
    expect(classifierVersionNullableSql).toContain("alter table hive.intake_runs");
    expect(classifierVersionNullableSql).toContain(
      "alter column classifier_version drop not null",
    );
  });

  it("adds domain resolution and pack execution columns on intake runs", () => {
    const domainPackSql = readFileSync(
      join(process.cwd(), "../../supabase/migrations/20261001120000_intake_domain_pack.sql"),
      "utf8",
    );
    expect(domainPackSql).toContain("raw_intent");
    expect(domainPackSql).toContain("explicit_domain_id");
    expect(domainPackSql).toContain("pack_execution jsonb");
    expect(domainPackSql).toContain("study_path");
    expect(adapter).toContain("raw_intent");
    expect(adapter).toContain("pack_execution");
    expect(adapter).toContain("resolved_domain_id");
  });

  it("allows case_view projection kind in case_projections", () => {
    const caseViewSql = readFileSync(
      join(process.cwd(), "../../supabase/migrations/20261002200000_case_projections_case_view.sql"),
      "utf8",
    );
    expect(caseViewSql).toContain("'case_view'");
    const projectionsAdapter = readFileSync(
      join(process.cwd(), "src/lib/persistence/supabase-case-projections.ts"),
      "utf8",
    );
    expect(projectionsAdapter).toContain("case_view");
  });

  it("allows LOCAL classifier on intake runs via follow-up migration", () => {
    const localClassifierSql = readFileSync(
      join(
        process.cwd(),
        "../../supabase/migrations/20261002210000_intake_runs_classifier_local.sql",
      ),
      "utf8",
    );
    expect(localClassifierSql).toContain("intake_runs_classifier_check");
    expect(localClassifierSql).toContain("'LOCAL'");
    expect(localClassifierSql).toContain("document_identities_proposal_check");
    expect(localClassifierSql).toContain("proposed_by in ('JEV', 'LOCAL')");
  });

  it("persists per-run source analysis disposition on document identities", () => {
    const dispositionSql = readFileSync(
      join(process.cwd(), "../../supabase/migrations/20261002120000_intake_analysis_disposition.sql"),
      "utf8",
    );
    expect(dispositionSql).toContain("analysis_disposition");
    expect(adapter).toContain("analysis_disposition");
  });
});
