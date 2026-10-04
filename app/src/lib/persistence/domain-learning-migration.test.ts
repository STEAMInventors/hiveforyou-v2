import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "../supabase/migrations/20260927230000_domain_learning_foundation.sql"),
  "utf8",
);

describe("domain learning migration", () => {
  it("creates learning tables with append-only protections and scoped RLS", () => {
    for (const table of [
      "hive.case_questions",
      "hive.case_question_answers",
      "hive.study_run_question_answers",
      "hive.study_run_documents",
      "hive.intelligence_lineage",
      "hive.domain_learning_observations",
      "hive.domain_learning_candidates",
      "hive.domain_learning_candidate_observations",
    ]) {
      expect(sql).toContain(`create table if not exists ${table}`);
    }
    expect(sql).toContain("unique (question_id, answer_version)");
    expect(sql).toContain("primary key (study_run_id, question_id)");
    expect(sql).toContain("primary key (study_run_id, source_document_id)");
    expect(sql).toContain("before update or delete on hive.case_question_answers");
    expect(sql).toContain("before update or delete on hive.domain_learning_observations");
    expect(sql).toContain("intelligence_lineage_user_assertion_no_document");
    expect(sql).toContain("intelligence_lineage_analysis_intent_no_document");
    expect(sql).toContain("intelligence_lineage_document_evidence_requires_document");
    expect(sql).toContain("intelligence_lineage_user_assertion_requires_answer");
    expect(sql).toContain("intelligence_lineage_derived_requires_parent");
    expect(sql).toContain("before update or delete on hive.case_questions");
    expect(sql).toContain("observation_schema_version");
    expect(sql).toContain("source_domain_pack_id");
    expect(sql).toContain("domain_learning_observations_domain_pack_type_idx");
    expect(sql).toContain("case_questions_learning_idx");
    expect(sql).toContain("using (user_id = auth.uid())");
    expect(sql).not.toContain("policy domain_learning_observations_select");
  });
});
