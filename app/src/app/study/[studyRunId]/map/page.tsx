import { StudyCaseMapClient } from "./StudyCaseMapClient";

type PageProps = {
  params: Promise<{ studyRunId: string }>;
};

export default async function StudyCaseMapPage({ params }: PageProps) {
  const { studyRunId } = await params;
  return <StudyCaseMapClient studyRunId={studyRunId} />;
}
