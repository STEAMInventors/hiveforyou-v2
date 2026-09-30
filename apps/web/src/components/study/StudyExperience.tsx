"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import {
  mapToStartCanonicalStudyRequest,
  getOrCreateClientCaseId,
} from "@/lib/canonical-study/map-start-request";
import {
  STUDY_STAGE_LABELS,
  STUDY_STAGE_ORDER,
} from "@/lib/canonical-study/processing-stages";
import { runCanonicalStudyViaApi } from "@/lib/canonical-study/study-client";
import type { StartCanonicalStudyRequest } from "@hiveforyou/shared/canonical-study";

export type StudyExperienceInput = {
  startRequest: StartCanonicalStudyRequest;
};

type UiPhase = "running" | "success" | "needs_review" | "failed";

export function StudyExperience({ startRequest }: StudyExperienceInput) {
  const [phase, setPhase] = useState<UiPhase>("running");
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const startRequestRef = useRef(startRequest);
  startRequestRef.current = startRequest;

  useEffect(() => {
    let cancelled = false;
    let stageTimer: ReturnType<typeof setInterval> | undefined;

    const run = async () => {
      stageTimer = setInterval(() => {
        setActiveStageIndex((i) =>
          i < STUDY_STAGE_ORDER.length - 1 ? i + 1 : i,
        );
      }, 450);

      let outcome;
      try {
        outcome = await runCanonicalStudyViaApi(startRequestRef.current);
      } catch {
        if (!cancelled) {
          clearInterval(stageTimer);
          setPhase("failed");
          setErrorCode("UNEXPECTED");
        }
        return;
      }
      if (cancelled) {
        return;
      }
      clearInterval(stageTimer);
      setActiveStageIndex(STUDY_STAGE_ORDER.length - 1);

      if (outcome.run.status === "SUCCEEDED") {
        setPhase("success");
      } else if (outcome.run.status === "NEEDS_REVIEW") {
        setPhase("needs_review");
      } else {
        setPhase("failed");
        setErrorCode(outcome.run.errorCode);
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (stageTimer) {
        clearInterval(stageTimer);
      }
    };
  }, [startRequest.caseId, startRequest.answerSnapshot.questionSetId]);

  if (phase === "running") {
    const label = STUDY_STAGE_LABELS[STUDY_STAGE_ORDER[activeStageIndex]!];
    return (
      <div data-testid="study-experience" className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-serif text-3xl font-bold text-hive-navy">
          Studying your case
        </h1>
        <p className="mt-4 font-sans text-base leading-relaxed text-hive-text-muted">
          Hive is connecting the documents, your answers, and the relationships
          between them.
        </p>
        <p
          className="mt-10 font-sans text-sm font-medium text-hive-navy"
          role="status"
          aria-live="polite"
          data-testid="study-stage-label"
        >
          {label}
        </p>
        <ol className="sr-only">
          {STUDY_STAGE_ORDER.map((stage, index) => (
            <li key={stage} aria-current={index === activeStageIndex ? "step" : undefined}>
              {STUDY_STAGE_LABELS[stage]}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div data-testid="study-experience" className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-serif text-3xl font-bold text-hive-navy">
          Your case study is ready.
        </h1>
        <p className="mt-4 font-sans text-base leading-relaxed text-hive-text-muted">
          Hive has finished organizing the supported facts, relationships,
          timeline, and open questions in your case.
        </p>
        <Link
          href="/case"
          data-testid="study-continue-case"
          className="mt-10 inline-flex items-center gap-2 rounded-hive-xl bg-hive-sage px-8 py-3.5 font-sans text-base font-bold text-hive-text-inverse shadow-hive-lg"
        >
          Continue
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
      </div>
    );
  }

  if (phase === "needs_review") {
    return (
      <div data-testid="study-experience" className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-serif text-3xl font-bold text-hive-navy">
          A few things need clarification.
        </h1>
        <p className="mt-4 font-sans text-base leading-relaxed text-hive-text-muted">
          Hive completed the study but found items it could not resolve
          confidently from the current materials.
        </p>
        <Link
          href="/questions"
          className="mt-10 inline-flex items-center gap-2 font-sans text-sm font-bold text-hive-sage"
        >
          Return to questions
        </Link>
      </div>
    );
  }

  const canRetry =
    errorCode === "ENGINE_UNAVAILABLE" ||
    errorCode === "PERSISTENCE_FAILURE" ||
    errorCode === "UNEXPECTED";

  return (
    <div data-testid="study-experience" className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="font-serif text-3xl font-bold text-hive-navy">
        Hive couldn&apos;t complete the study.
      </h1>
      <p className="mt-4 font-sans text-base leading-relaxed text-hive-text-muted">
        Something interrupted the study. Your documents and answers are still
        here.
      </p>
      <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        {canRetry ? (
          <button
            type="button"
            className="rounded-hive-xl border border-hive-border px-6 py-3 font-sans text-sm font-bold text-hive-navy"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        ) : null}
        <Link
          href="/questions"
          className="font-sans text-sm font-bold text-hive-sage"
        >
          Back to questions
        </Link>
        <Link href="/" className="font-sans text-sm font-bold text-hive-sage">
          Documents
        </Link>
      </div>
    </div>
  );
}

export function buildStudyExperienceFromSession(input: {
  stagedDocuments: import("@/lib/staged-documents").StagedDocument[];
  discovery: import("@/lib/document-discovery/types").DocumentDiscoveryResult;
  discoveryRunId?: string;
  questionSet: import("@/lib/questions/types").QuestionSet;
  answerSnapshot: import("@/lib/questions/types").QuestionsAnswerSnapshot;
}): StudyExperienceInput {
  return {
    startRequest: mapToStartCanonicalStudyRequest({
      caseId: getOrCreateClientCaseId(),
      ...input,
    }),
  };
}
