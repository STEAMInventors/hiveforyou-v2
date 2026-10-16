import { CaseWorkspaceLandingExperience } from "@/components/hive-customer/HiveCustomerShell";
import { HiveExtractionReadyExperience } from "@/components/hive-customer/HiveExtractionReadyExperience";
import { parseCaseDocumentsView } from "@/lib/intake/study-completion-navigation";
import type { CaseWorkspaceAudience } from "@/lib/intake/study-completion-navigation";

type PageProps = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{
    studyRunId?: string;
    intakeRunId?: string;
    audience?: string;
    documentsView?: string;
  }>;
};

export default async function HiveReadyPage({ params, searchParams }: PageProps) {
  const { caseId } = await params;
  const query = await searchParams;
  const studyRunId = query.studyRunId?.trim() ?? "";
  const audienceRaw = query.audience?.trim().toLowerCase();
  const audience: CaseWorkspaceAudience | undefined =
    audienceRaw === "pro" ? "pro" : audienceRaw === "customer" ? "customer" : undefined;

  if (!studyRunId) {
    return (
      <CaseWorkspaceLandingExperience
        caseId={caseId}
        intakeRunId={query.intakeRunId?.trim()}
        audience={audience}
      />
    );
  }

  return (
    <HiveExtractionReadyExperience
      caseId={caseId}
      studyRunId={studyRunId}
      documentsView={parseCaseDocumentsView(query.documentsView)}
      workspaceAudience={audience}
    />
  );
}
