import { HiveBuildingProgressExperience } from "@/components/hive-customer/HiveBuildingProgressExperience";

type PageProps = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ studyRunId?: string }>;
};

export default async function HiveBuildingPage({ params, searchParams }: PageProps) {
  const { caseId } = await params;
  const query = await searchParams;
  const studyRunId = query.studyRunId?.trim() ?? "";

  return <HiveBuildingProgressExperience caseId={caseId} studyRunId={studyRunId} />;
}
