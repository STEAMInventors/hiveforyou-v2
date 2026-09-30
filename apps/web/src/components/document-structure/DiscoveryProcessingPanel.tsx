import { HiveHexAnimation } from "@/components/document-structure/HiveHexAnimation";
import { PROCESSING_STAGE_LABELS } from "@/lib/document-discovery/processing-stages";
import type { StagedDocument } from "@/lib/staged-documents";

type DiscoveryProcessingPanelProps = {
  activeStageIndex: number;
  stagedDocuments: StagedDocument[];
  /** When set, show a resolved domain. When omitted, use neutral organizing copy only. */
  domainHint?: { label: string } | null;
  paused?: boolean;
  compact?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
};

export function DiscoveryProcessingPanel({
  activeStageIndex,
  stagedDocuments,
  domainHint = null,
  paused = false,
  compact = false,
  errorMessage = null,
  onRetry,
}: DiscoveryProcessingPanelProps) {
  const activeLabel = PROCESSING_STAGE_LABELS[activeStageIndex] ?? PROCESSING_STAGE_LABELS[0];
  const headline = errorMessage
    ? "We couldn't finish organizing"
    : paused
      ? "Waiting for your response…"
      : activeLabel;

  if (compact) {
    return (
      <section
        data-testid="discovery-processing-panel"
        className="flex w-full flex-col items-center text-center"
        aria-busy={!paused && !errorMessage}
      >
        {!errorMessage ? (
          <HiveHexAnimation className="mb-4 h-20 w-20 sm:mb-5 sm:h-24 sm:w-24" />
        ) : null}

        <p
          className="font-serif text-lg font-semibold tracking-tight text-hive-navy sm:text-xl"
          role="status"
          aria-live="polite"
          data-testid="processing-stage-indicator"
        >
          {headline}
        </p>

        {errorMessage ? (
          <p className="mt-3 max-w-md font-sans text-sm text-hive-text-muted" role="alert">
            {errorMessage}
          </p>
        ) : null}

        {errorMessage && onRetry ? (
          <button
            type="button"
            className="mt-5 rounded-hive-lg bg-hive-sage px-5 py-2.5 font-sans text-sm font-semibold text-hive-text-inverse hover:bg-hive-sage-muted"
            onClick={onRetry}
          >
            Try again
          </button>
        ) : null}

        {!errorMessage ? (
          <p className="mt-1.5 font-sans text-xs text-hive-text-muted">
            {domainHint ? `Domain: ${domainHint.label}` : "Organizing your documents"}
          </p>
        ) : null}

        <ol
          className="mt-4 flex w-full max-w-md flex-col gap-0.5 text-left"
          aria-label="Processing stages"
        >
          {PROCESSING_STAGE_LABELS.map((label, index) => {
            const complete = index < activeStageIndex;
            const current = index === activeStageIndex && !paused;
            return (
              <li
                key={label}
                aria-current={current ? "step" : undefined}
                className={[
                  "flex items-center gap-2 rounded-hive-md px-2 py-1 font-sans text-xs",
                  current ? "bg-hive-soft-sky/60 font-medium text-hive-navy" : "",
                  complete ? "text-hive-blue" : "text-hive-text-muted/90",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold",
                    complete
                      ? "bg-hive-sage text-white"
                      : current
                        ? "border border-hive-sage bg-hive-surface text-hive-sage"
                        : "border border-hive-border/80 bg-hive-page text-hive-text-muted",
                  ].join(" ")}
                  aria-hidden
                >
                  {complete ? "✓" : index + 1}
                </span>
                <span className="truncate">{label}</span>
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  return (
    <section
      data-testid="discovery-processing-panel"
      className="flex min-h-[min(72vh,640px)] w-full flex-col items-center justify-center rounded-hive-2xl border border-hive-border bg-gradient-to-b from-hive-soft-sky/50 via-hive-surface to-hive-surface px-6 py-12 shadow-hive-md sm:px-10"
      aria-busy={!paused && !errorMessage}
    >
      {!errorMessage ? <HiveHexAnimation className="mb-8" /> : null}

      <p
        className="font-serif text-2xl font-semibold tracking-tight text-hive-navy sm:text-3xl"
        role="status"
        aria-live="polite"
        data-testid="processing-stage-indicator"
      >
        {headline}
      </p>

      {errorMessage ? (
        <p className="mt-3 max-w-md text-center font-sans text-sm text-hive-text-muted" role="alert">
          {errorMessage}
        </p>
      ) : (
        <p className="mt-3 max-w-md text-center font-sans text-sm text-hive-text-muted">
          {domainHint ? `Domain: ${domainHint.label}` : "Organizing your documents"}
        </p>
      )}

      <ol className="mt-8 flex w-full max-w-lg flex-col gap-2" aria-label="Processing stages">
        {PROCESSING_STAGE_LABELS.map((label, index) => {
          const complete = index < activeStageIndex;
          const current = index === activeStageIndex && !paused;
          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className={[
                "flex items-center gap-3 rounded-hive-lg px-3 py-2 font-sans text-sm",
                current ? "bg-hive-soft-sky/70 font-medium text-hive-navy" : "",
                complete ? "text-hive-blue" : "text-hive-text-muted",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  complete
                    ? "bg-hive-sage text-white"
                    : current
                      ? "border border-hive-sage bg-hive-surface text-hive-sage"
                      : "border border-hive-border bg-hive-page text-hive-text-muted",
                ].join(" ")}
                aria-hidden
              >
                {complete ? "✓" : index + 1}
              </span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>

      {activeStageIndex === 0 && stagedDocuments.length > 0 && (
        <ul
          className="mt-8 flex max-w-xl flex-wrap justify-center gap-2"
          aria-label="Files received"
        >
          {stagedDocuments.map((item) => (
            <li
              key={item.id}
              className="rounded-full border border-hive-border bg-hive-surface px-3 py-1 font-mono text-xs text-hive-blue"
            >
              {item.file.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
