import { HiveBuildingProgressExperience } from "@/components/hive-customer/HiveBuildingProgressExperience";
import { CaseWorkspaceLandingExperience } from "@/components/hive-customer/HiveCustomerShell";
import { parseCaseDocumentsView } from "@/lib/intake/study-completion-navigation";

type PageProps = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ studyRunId?: string; intakeRunId?: string; documentsView?: string }>;
};

export default async function HiveBuildingPage({ params, searchParams }: PageProps) {
  const { caseId } = await params;
  const query = await searchParams;
  const studyRunId = query.studyRunId?.trim() ?? "";

  if (!studyRunId) {
    return (
      <CaseWorkspaceLandingExperience
        caseId={caseId}
        intakeRunId={query.intakeRunId?.trim()}
      />
    );
  }

  return (
    <HiveBuildingProgressExperience
      caseId={caseId}
      studyRunId={studyRunId}
      documentsView={parseCaseDocumentsView(query.documentsView)}
    />
  );
}
