import { NextResponse } from "next/server";

<<<<<<< HEAD
import { jsonFromAccessError, requireAdmin, requireCaseAccess } from "@/lib/auth/require-case-access";
import { denyUnlessHiveDebugRoutesEnabled } from "@/lib/preview/hive-debug-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
=======
import { denyUnlessHiveDebugRoutesEnabled } from "@/lib/preview/hive-debug-server";
import { createServerSupabaseClient, getAuthenticatedUserId } from "@/lib/supabase/server";
>>>>>>> ba67a14 (SEC-01a: disable debug routes unless explicitly enabled)

export async function GET(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
): Promise<Response> {
  const disabled = denyUnlessHiveDebugRoutesEnabled();
  if (disabled) {
    return disabled;
<<<<<<< HEAD
=======
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
>>>>>>> ba67a14 (SEC-01a: disable debug routes unless explicitly enabled)
  }

  const { caseId } = await context.params;
  const url = new URL(request.url);
  const studyRunId = url.searchParams.get("studyRunId")?.trim();
  if (!studyRunId) {
    return NextResponse.json({ error: "STUDY_RUN_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const { user } = await requireAdmin(request);
    await requireCaseAccess(request, caseId);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .schema("hive")
      .from("shadow_study_artifacts")
      .select(
        "status, failed_step, findings_json, statements_count, facts_count, multi_source_facts_count, coverage_json, drops_json, token_usage_json, started_at, completed_at",
      )
      .eq("case_id", caseId)
      .eq("study_run_id", studyRunId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "LOAD_FAILED" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ artifact: null });
    }

    return NextResponse.json({ artifact: data });
  } catch (error) {
    const accessResponse = jsonFromAccessError(error);
    if (accessResponse) {
      return accessResponse;
    }
    return NextResponse.json({ error: "UNEXPECTED" }, { status: 500 });
  }
}
