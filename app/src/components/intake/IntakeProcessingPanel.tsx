"use client";

import { isIntakeProcessingDelayed } from "@hiveforyou/shared/intake";
import { useRef } from "react";

import type { IntakeEvidenceWorkspaceView } from "@hiveforyou/shared/intake";

import { LifecycleRail } from "@/components/hive-lifecycle/LifecycleRail";
import { ReadingHiveSvg } from "@/components/hive-lifecycle/ReadingHiveSvg";
import { StageList } from "@/components/hive-lifecycle/StageList";
import {
  MODAL1_PHASES,
  useHeldPhase,
  useLifecycleModalEffects,
  type Modal1Phase,
} from "@/components/hive-lifecycle/stages";
import type { ComposerPurpose } from "@/components/UploadExperience";
import type { IntakePreRunPhase } from "@/lib/intake/intake-upload-phases";

type IntakeProcessingPanelProps = {
  view: IntakeEvidenceWorkspaceView | null;
  errorMessage?: string | null;
  composerPurpose?: ComposerPurpose | null;
  onClose?: () => void;
  onAddMoreFiles?: () => void;
  onOpenHive?: () => void;
  preRunPhase?: IntakePreRunPhase;
  documentCount?: number;
};

const PRESENTATION: Record<
  Modal1Phase,
  {
    cardClass: string;
    current: number;
    finishedThrough: number;
    title: string;
    subtitle: string;
  }
> = {
  trigger: {
    cardClass: "p-trigger",
    current: 0,
    finishedThrough: -1,
    title: "Reading your documents",
    subtitle: "Step 1 of 2 · this part usually takes about a minute.",
  },
  formation: {
    cardClass: "p-formation",
    current: 1,
    finishedThrough: 0,
    title: "Reading your documents",
    subtitle: "Step 1 of 2 · almost there.",
  },
  complete: {
    cardClass: "p-formation done1",
    current: 2,
    finishedThrough: 1,
    title: "Your documents are read",
    subtitle: "Next, check the list — then Hive connects everything.",
  },
};

function intakeLifecycleTarget(input: {
  statuses: readonly string[];
  workspaceReady: boolean;
  runStatus: string | null;
}): Modal1Phase {
  if (input.workspaceReady && input.runStatus === "SUCCEEDED") {
    return "complete";
  }
  if (input.statuses.some((status) => status === "CLASSIFIED" || status === "NEEDS_REVIEW")) {
    return "formation";
  }
  return "trigger";
}

function IntakeLifecycleCard({
  target,
  errorMessage,
  processingDelayedMessage,
  onClose,
  onOpenHive,
}: {
  target: Modal1Phase;
  errorMessage: string | null;
  processingDelayedMessage: string | null;
  onClose?: () => void;
  onOpenHive?: () => void;
}) {
  const shown = useHeldPhase(target, MODAL1_PHASES);
  const reviewRef = useRef<HTMLButtonElement>(null);
  const complete = !errorMessage && shown === "complete";
  useLifecycleModalEffects(!complete, reviewRef);
  const presentation = PRESENTATION[shown];

  if (errorMessage) {
    return (
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intake-lifecycle-title"
        data-testid="intake-processing-panel"
      >
        <h2 id="intake-lifecycle-title" data-testid="intake-heading">
          We need your help
        </h2>
        <p className="sub" role="alert">
          {errorMessage}
        </p>
        {onClose ? (
          <div className="actions">
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`card ${presentation.cardClass}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="intake-lifecycle-title"
      aria-busy={!complete}
      data-testid="intake-processing-panel"
    >
      <LifecycleRail current={presentation.current} finishedThrough={presentation.finishedThrough} />
      <ReadingHiveSvg />
      <div>
        <h2 id="intake-lifecycle-title" data-testid="intake-heading">
          {presentation.title}
        </h2>
        <p className="sub">{presentation.subtitle}</p>
        {processingDelayedMessage ? (
          <p className="sub" role="status" data-testid="intake-processing-delayed">
            {processingDelayedMessage}
          </p>
        ) : null}
      </div>
      <StageList
        stages={[0, 1]}
        current={presentation.current}
        finishedThrough={presentation.finishedThrough}
      />
      {complete ? (
        <div className="actions">
          <button
            ref={reviewRef}
            type="button"
            className="btn dark"
            data-testid="intake-open-hive"
            onClick={() => onOpenHive?.()}
          >
            Review my documents
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function IntakeProcessingPanel({
  view,
  errorMessage = null,
  onClose,
  onOpenHive,
  preRunPhase = null,
}: IntakeProcessingPanelProps) {
  const statuses = view?.documents.map((document) => document.processingStatus) ?? [];
  const runStatus = view?.status ?? (preRunPhase ? "RUNNING" : null);
  const target = intakeLifecycleTarget({
    statuses,
    workspaceReady: view?.workspaceReady ?? false,
    runStatus,
  });
  const processingDelayed =
    view &&
    isIntakeProcessingDelayed(view.status, view.runStartedAt ?? null);
  const processingDelayedMessage = processingDelayed
    ? "This is taking longer than expected. We're still waiting to start reading your documents."
    : null;

  return (
    <div className="hive-lifecycle overlay" data-testid="intake-processing-modal">
      <IntakeLifecycleCard
        key={view?.intakeRunId ?? "intake-start"}
        target={target}
        errorMessage={errorMessage}
        processingDelayedMessage={processingDelayedMessage}
        onClose={onClose}
        onOpenHive={onOpenHive}
      />
    </div>
  );
}
