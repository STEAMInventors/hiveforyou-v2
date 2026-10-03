"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import {
  HIVE_BUILDING_COPY,
  hiveBuildingStepLabels,
  type HiveBuildingPhase,
} from "@/lib/hive-building-phases";

import { HiveFlyingHoneycomb } from "./HiveFlyingHoneycomb";

const STAGE_COLORS = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"] as const;

function stepTextStyle(done: boolean, active: boolean): CSSProperties {
  if (done) {
    return { color: "#3C4043" };
  }
  if (active) {
    return { color: "#0D0D0D", fontWeight: 600 };
  }
  return { color: "#9AA0A6" };
}

export type HiveBuildingModalProps = {
  phase: HiveBuildingPhase;
  activeStepIndex: number;
  finished?: boolean;
  errorMessage?: string | null;
  /** Remount fly-in animation when a new run starts. */
  animationKey?: string | number;
  onClose?: () => void;
  primaryAction?: { label: string; onClick: () => void; testId?: string };
  secondaryAction?: { label: string; onClick: () => void; testId?: string };
  children?: ReactNode;
  overlayTestId?: string;
  panelTestId?: string;
  headingTestId?: string;
  /** Replaces default in-progress subtitle (e.g. upload vs extraction). */
  buildingSubtitleOverride?: string | null;
};

export function HiveBuildingModal({
  phase,
  activeStepIndex,
  finished = false,
  errorMessage = null,
  animationKey,
  onClose,
  primaryAction,
  secondaryAction,
  children,
  overlayTestId = "hive-building-modal",
  panelTestId = "hive-building-panel",
  headingTestId = "hive-building-heading",
  buildingSubtitleOverride = null,
}: HiveBuildingModalProps) {
  const steps = hiveBuildingStepLabels(phase);
  const copy = HIVE_BUILDING_COPY[phase];

  const title = errorMessage
    ? "We need your help"
    : finished
      ? copy.readyTitle
      : copy.buildingTitle;

  const subtitle = errorMessage
    ? null
    : finished
      ? copy.readySubtitle
      : buildingSubtitleOverride ?? copy.buildingSubtitle;

  const done = finished && !errorMessage;
  const clampedIndex = Math.min(Math.max(activeStepIndex, 0), steps.length - 1);

  const stepBase = clampedIndex / steps.length;
  const stepCeil = (clampedIndex + 1) / steps.length;
  const [colorProgress, setColorProgress] = useState(stepBase);

  useEffect(() => {
    if (done || errorMessage) {
      setColorProgress(1);
      return;
    }
    setColorProgress(stepBase);
    const timer = setInterval(() => {
      setColorProgress((value) => {
        if (value >= stepCeil - 0.002) {
          return stepCeil;
        }
        return Math.min(stepCeil, value + 0.012);
      });
    }, 140);
    return () => clearInterval(timer);
  }, [done, errorMessage, stepBase, stepCeil]);

  const pct = done
    ? 100
    : Math.round(((done ? steps.length : clampedIndex) / steps.length) * 100);
  const barWidth = `${Math.max(pct, 6)}%`;
  const hiveCls = done ? "hf-done" : "hf-building";

  const showActions = done && (primaryAction || secondaryAction);

  return (
    <div className="hf-overlay" data-testid={overlayTestId}>
      <div
        className={`hf-card ${hiveCls}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hiveBuildingTitle"
        data-testid={panelTestId}
        aria-busy={!errorMessage && !done}
      >
        {onClose ? (
          <button type="button" className="hf-close hf-icon-btn" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5F6368" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        ) : null}

        {!errorMessage ? (
          <HiveFlyingHoneycomb animationKey={animationKey} colorProgress={colorProgress} done={done} />
        ) : null}

        <div className="hf-head">
          <h2 id="hiveBuildingTitle" data-testid={headingTestId}>
            {title}
          </h2>
          {subtitle ? (
            <p className="hf-sub" role="status" aria-live="polite">
              {subtitle}
            </p>
          ) : null}
        </div>

        {errorMessage ? (
          <p className="hf-error" role="alert">
            {errorMessage}
          </p>
        ) : (
          <>
            {children}
            <div className="hf-bar">
              <div className="hf-bar-fill" style={{ width: barWidth }} data-testid="hive-building-progress" />
            </div>
            <ol className="hf-steps" aria-label="Progress" data-testid="hive-building-stages">
              {steps.map((label, index) => {
                const stepDone = done || index < clampedIndex;
                const active = !done && index === clampedIndex;
                const color = STAGE_COLORS[index] ?? STAGE_COLORS[0];
                return (
                  <li
                    key={label}
                    data-testid={
                      active
                        ? phase === "intake"
                          ? "intake-processing-stage-current"
                          : "hive-building-stage-current"
                        : undefined
                    }
                  >
                    <span className="hf-step-ic">
                      {stepDone ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                          <circle cx="12" cy="12" r="10" fill={color} />
                          <path
                            d="m7.5 12.5 3 3 6-6.5"
                            fill="none"
                            stroke="#FFFFFF"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                      {active ? (
                        <svg className="hf-spin" width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                          <circle cx="12" cy="12" r="9" fill="none" stroke="#E8EAED" strokeWidth="3" />
                          <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
                        </svg>
                      ) : null}
                      {!stepDone && !active ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                          <circle cx="12" cy="12" r="9" fill="none" stroke="#DADCE0" strokeWidth="2" />
                        </svg>
                      ) : null}
                    </span>
                    <span style={stepTextStyle(stepDone, active)}>{label}</span>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {showActions ? (
          <div className="hf-actions">
            {secondaryAction ? (
              <button
                type="button"
                className="hf-btn"
                data-testid={secondaryAction.testId}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </button>
            ) : null}
            {primaryAction ? (
              <button
                type="button"
                className="hf-btn hf-btn-dark"
                data-testid={primaryAction.testId}
                onClick={primaryAction.onClick}
              >
                {primaryAction.label}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
