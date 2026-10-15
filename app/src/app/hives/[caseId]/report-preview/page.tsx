import { CanonicalStudyReportPreviewExperience } from "@/components/hive-customer/CanonicalStudyReportPreviewExperience";

type PageProps = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ studyRunId?: string; audience?: string }>;
};

export default async function HiveReportPreviewPage({ params, searchParams }: PageProps) {
  const { caseId } = await params;
  const query = await searchParams;
  const studyRunId = query.studyRunId?.trim() ?? "";
  const audienceRaw = query.audience?.trim().toLowerCase();
  const audience = audienceRaw === "pro" ? "pro" : "customer";

  return (
    <CanonicalStudyReportPreviewExperience
      caseId={caseId}
      studyRunId={studyRunId}
      initialAudience={audience}
    />
  );
}
