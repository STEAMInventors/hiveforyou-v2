import { PROCESSING_STAGE_LABELS } from "@/lib/document-discovery/processing-stages";

type ProcessingStageIndicatorProps = {
  activeStageIndex: number;
  settled: boolean;
};

export function ProcessingStageIndicator({
  activeStageIndex,
  settled,
}: ProcessingStageIndicatorProps) {
  if (settled) {
    return null;
  }

  return (
    <div
      data-testid="processing-stage-indicator"
      className="mb-2 w-full"
      role="status"
      aria-live="polite"
    >
      <ol className="sr-only">
        {PROCESSING_STAGE_LABELS.map((label, index) => (
          <li key={label} aria-current={index === activeStageIndex ? "step" : undefined}>
            {label}
          </li>
        ))}
      </ol>
      <div className="flex justify-center gap-2" aria-hidden>
        {PROCESSING_STAGE_LABELS.map((_, index) => (
          <span
            key={index}
            className={[
              "h-1.5 w-8 rounded-full",
              index <= activeStageIndex ? "bg-hive-sage" : "bg-hive-border",
            ].join(" ")}
          />
        ))}
      </div>
    </div>
  );
}
