import { CanonicalStudyJsonView } from "@/components/hive-customer/CanonicalStudyJsonView";

type PageProps = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ studyRunId?: string }>;
};

export default async function HiveCanonicalJsonPage({ params, searchParams }: PageProps) {
  const { caseId } = await params;
  const query = await searchParams;
  const studyRunId = query.studyRunId?.trim() ?? "";

  return <CanonicalStudyJsonView caseId={caseId} studyRunId={studyRunId} />;
}
