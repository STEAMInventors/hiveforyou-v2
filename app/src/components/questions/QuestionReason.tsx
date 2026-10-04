type QuestionReasonProps = {
  reason: string;
};

export function QuestionReason({ reason }: QuestionReasonProps) {
  return (
    <p className="font-sans text-sm leading-relaxed text-hive-text-muted">
      <span className="font-medium text-hive-blue">Why Hive asked: </span>
      {reason}
    </p>
  );
}
