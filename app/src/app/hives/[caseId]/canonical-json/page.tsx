import { CanonicalStudyJsonView } from "@/components/hive-customer/CanonicalStudyJsonView";

type PageProps = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ studyRunId?: string; intakeRunId?: string; audience?: string }>;
};

export default async function HiveCanonicalJsonPage({ params, searchParams }: PageProps) {
  const { caseId } = await params;
  const query = await searchParams;
  const studyRunId = query.studyRunId?.trim() ?? "";
  const audienceRaw = query.audience?.trim().toLowerCase();
  const workspaceAudience =
    audienceRaw === "pro" ? "pro" : audienceRaw === "customer" ? "customer" : undefined;

  return (
    <CanonicalStudyJsonView
      caseId={caseId}
      studyRunId={studyRunId}
      intakeRunId={query.intakeRunId?.trim()}
      workspaceAudience={workspaceAudience}
    />
  );
}
