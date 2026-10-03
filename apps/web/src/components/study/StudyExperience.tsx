"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { HiveBuildingModal } from "@/components/hive/HiveBuildingModal";
import {
  mapToStartCanonicalStudyRequest,
  getOrCreateClientCaseId,
} from "@/lib/canonical-study/map-start-request";
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
  const [completedStudyRunId, setCompletedStudyRunId] = useState<string | undefined>();
  const startRequestRef = useRef(startRequest);
  startRequestRef.current = startRequest;

  useEffect(() => {
    let cancelled = false;
    let stageTimer: ReturnType<typeof setInterval> | undefined;

    const run = async () => {
      stageTimer = setInterval(() => {
        setActiveStageIndex((i) => (i < 3 ? i + 1 : i));
      }, 1500);

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
      setActiveStageIndex(3);

      setCompletedStudyRunId(outcome.run.studyRunId);
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
    return (
      <div data-testid="study-experience">
        <HiveBuildingModal
          phase="study"
          activeStepIndex={activeStageIndex}
          animationKey={startRequest.caseId}
          overlayTestId="study-building-modal"
          headingTestId="study-stage-label"
        />
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div data-testid="study-experience" className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-serif text-3xl font-bold text-hive-navy">Your case study is ready.</h1>
        <p className="mt-4 font-sans text-base leading-relaxed text-hive-text-muted">
          Hive has finished organizing the supported facts, relationships, timeline, and open questions in your case.
        </p>
        {completedStudyRunId ? (
          <Link
            href={`/study/${encodeURIComponent(completedStudyRunId)}/map`}
            data-testid="study-continue-case"
            className="mt-8 inline-flex items-center gap-2 rounded-hive-lg bg-hive-navy px-6 py-3 font-sans text-sm font-semibold text-white hover:bg-hive-navy/90"
          >
            Open my hive
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    );
  }

  if (phase === "needs_review") {
    return (
      <div data-testid="study-experience" className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-serif text-3xl font-bold text-hive-navy">Your hive needs a quick review.</h1>
        <p className="mt-4 font-sans text-base leading-relaxed text-hive-text-muted">
          Hive finished studying your documents, but a few items need professional review before everything is shown as
          supported.
        </p>
        {completedStudyRunId ? (
          <Link
            href={`/study/${encodeURIComponent(completedStudyRunId)}/map`}
            className="mt-8 inline-flex items-center gap-2 rounded-hive-lg bg-hive-navy px-6 py-3 font-sans text-sm font-semibold text-white hover:bg-hive-navy/90"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div data-testid="study-experience" className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="font-serif text-3xl font-bold text-hive-navy">We couldn&apos;t finish building your hive.</h1>
      <p className="mt-4 font-sans text-base leading-relaxed text-hive-text-muted">
        {errorCode === "ENGINE_UNAVAILABLE"
          ? "The study service is unavailable right now. Please try again later."
          : "Something went wrong while studying your documents. Please try again."}
      </p>
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
