export type CustomerDiscoveryAnswer = {
  questionId: string;
  evidenceKind: "CUSTOMER_ASSERTION";
  answer: Record<string, unknown>;
  answeredAt: string;
  userId: string;
  discoverRunId: string;
  caseId: string;
  intakeRunId?: string | null;
};
