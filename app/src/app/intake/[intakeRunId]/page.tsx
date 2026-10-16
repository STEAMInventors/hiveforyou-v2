import { IntakeEvidenceWorkspace } from "@/components/intake/IntakeEvidenceWorkspace";
import { parseCaseDocumentsView } from "@/lib/intake/study-completion-navigation";

type PageProps = {
  params: Promise<{ intakeRunId: string }>;
  searchParams: Promise<{ studyRunId?: string; audience?: string; documentsView?: string }>;
};

export default async function IntakeRunPage({ params, searchParams }: PageProps) {
  const { intakeRunId } = await params;
  const query = await searchParams;
  const studyRunId = query.studyRunId?.trim();
  const audienceRaw = query.audience?.trim().toLowerCase();
  const audience = audienceRaw === "pro" ? "pro" : audienceRaw === "customer" ? "customer" : undefined;

  return (
    <IntakeEvidenceWorkspace
      intakeRunId={intakeRunId}
      workspaceStudyRunId={studyRunId}
      workspaceAudience={audience}
      documentsView={parseCaseDocumentsView(query.documentsView)}
    />
  );
}
