"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { HiveTransitionModal } from "@/components/hive/HiveTransitionModal";
import { HiveFooter } from "@/components/HiveFooter";
import { HiveHeader } from "@/components/HiveHeader";
import {
  StudyExperience,
  buildStudyExperienceFromSession,
} from "@/components/study/StudyExperience";
import { adaptStagedDocumentsToDiscovery } from "@/lib/document-discovery/adapt-staged-to-discovery";
import {
  readClientDiscovery,
  readClientDiscoveryRunId,
} from "@/lib/document-discovery/discovery-session";
import { useStagedDocuments } from "@/lib/intake/staged-documents-context";
import { buildQuestionSetFromDiscovery } from "@/lib/questions/fixtures";
import { countRequiredProgress } from "@/lib/questions/completion";
import { consumeStashedStudySnapshot } from "@/lib/canonical-study/study-navigation";

export default function StudyPage() {
  const router = useRouter();
  const { documents } = useStagedDocuments();
  const [ready, setReady] = useState(false);
  const [snapshot] = useState(() =>
    typeof window !== "undefined" ? consumeStashedStudySnapshot() : null,
  );

  useEffect(() => {
    setReady(true);
  }, []);

  const studyInput = useMemo(() => {
    if (!documents.length || !snapshot) {
      return null;
    }
    const discovery = readClientDiscovery() ?? adaptStagedDocumentsToDiscovery(documents);
    const questionSet = buildQuestionSetFromDiscovery(discovery);
    const progress = countRequiredProgress(questionSet.questions, snapshot.answers);
    if (!progress.canStudy) {
      return null;
    }
    const discoveryRunId = readClientDiscoveryRunId() ?? undefined;
    return buildStudyExperienceFromSession({
      stagedDocuments: documents,
      discovery,
      discoveryRunId,
      questionSet,
      answerSnapshot: snapshot,
    });
  }, [documents, snapshot]);

  useEffect(() => {
    if (ready && documents.length === 0) {
      router.replace("/");
    }
  }, [ready, documents.length, router]);

  useEffect(() => {
    if (ready && documents.length > 0 && !studyInput) {
      router.replace("/questions");
    }
  }, [ready, documents.length, studyInput, router]);

  if (!ready || !studyInput) {
    return <HiveTransitionModal phase="study" headingTestId="study-stage-label" />;
  }

  return (
    <>
      <HiveHeader />
      <main className="flex-1 bg-hive-page py-6 sm:py-8">
        <StudyExperience startRequest={studyInput.startRequest} />
      </main>
      <HiveFooter />
    </>
  );
}
