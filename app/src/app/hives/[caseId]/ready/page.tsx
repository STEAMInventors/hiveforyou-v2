import { HiveExtractionReadyExperience } from "@/components/hive-customer/HiveExtractionReadyExperience";

type PageProps = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ studyRunId?: string }>;
};

export default async function HiveReadyPage({ params, searchParams }: PageProps) {
  const { caseId } = await params;
  const query = await searchParams;
  const studyRunId = query.studyRunId?.trim() ?? "";

  return <HiveExtractionReadyExperience caseId={caseId} studyRunId={studyRunId} />;
}
