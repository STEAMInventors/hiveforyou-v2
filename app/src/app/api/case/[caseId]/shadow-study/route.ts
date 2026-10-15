import { NextResponse } from "next/server";

import {
  createAuthenticatedSupabaseClient,
  getAuthenticatedUserId,
} from "@/lib/supabase/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { caseId } = await context.params;
  const url = new URL(request.url);
  const studyRunId = url.searchParams.get("studyRunId")?.trim();
  if (!studyRunId) {
    return NextResponse.json({ error: "STUDY_RUN_ID_REQUIRED" }, { status: 400 });
  }

  const supabase = await createAuthenticatedSupabaseClient();
  const { data, error } = await supabase
    .schema("hive")
    .from("shadow_study_artifacts")
    .select(
      "status, failed_step, findings_json, statements_count, facts_count, multi_source_facts_count, coverage_json, drops_json, token_usage_json, started_at, completed_at",
    )
    .eq("case_id", caseId)
    .eq("study_run_id", studyRunId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ artifact: null });
  }

  return NextResponse.json({ artifact: data });
}
