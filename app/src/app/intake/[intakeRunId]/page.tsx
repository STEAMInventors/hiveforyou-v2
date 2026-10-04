import { IntakeEvidenceWorkspace } from "@/components/intake/IntakeEvidenceWorkspace";

type PageProps = {
  params: Promise<{ intakeRunId: string }>;
};

export default async function IntakeRunPage({ params }: PageProps) {
  const { intakeRunId } = await params;

  return <IntakeEvidenceWorkspace intakeRunId={intakeRunId} />;
}
