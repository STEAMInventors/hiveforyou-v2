"use client";

import { useMemo, useState } from "react";

import {
  buildRulebookDocumentExplainers,
  resolveDomainPackId,
} from "@hiveforyou/core/rulebook-explainers";
import { CASE_VIEW_V2_SCHEMA, type CaseViewV2 } from "@hiveforyou/shared/projections";

import type { ProvenanceIndex } from "@/lib/case/provenance-index";
import type { CaseSummaryPanelSpec } from "@/lib/case-summary/case-summary-evidence";
import type { CaseSummaryDecision, CaseSummaryModel } from "@/lib/case-summary/case-summary-presentation";
import { meetingQuestionsFromAnswers } from "@/lib/case-summary/case-summary-presentation";

import { HiveCaseDocumentExplainerView } from "./HiveCaseDocumentExplainerView";
import { HiveCaseLayout } from "./HiveCaseLayout";
import { HiveCaseMeetingPrepView } from "./HiveCaseMeetingPrepView";
import { HiveCasePlanView } from "./HiveCasePlanView";
import { HiveCaseStoryView } from "./HiveCaseStoryView";
import { HiveCaseTimelineView } from "./HiveCaseTimelineView";
import { isDocumentExplainerTab, type HiveCaseTab } from "./hive-case-tokens";

export function HiveCaseCustomerExperience({
  caseView,
  summaryModel,
  provenance,
  onOpenPanel,
  onProView,
  currentDecision,
  openDecisions,
  decisionIndex,
  decisionTotal,
  onPickDecision,
  onUnsureDecision,
  answers,
  statusCounts,
  intelligenceDomainId,
}: {
  caseView: CaseViewV2 | null;
  intelligenceDomainId?: string | null;
  summaryModel: CaseSummaryModel;
  provenance: ProvenanceIndex | null;
  statusCounts: { needs: number; changed: number; missing: number; checked: number };
  onOpenPanel: (spec: CaseSummaryPanelSpec) => void;
  onProView: () => void;
  currentDecision: CaseSummaryDecision | null;
  openDecisions: CaseSummaryDecision[];
  decisionIndex: number;
  decisionTotal: number;
  onPickDecision: (label: string) => void;
  onUnsureDecision: () => void;
  answers: Record<string, string>;
}) {
  const [tab, setTab] = useState<HiveCaseTab>("story");

  const presentation = useMemo(() => {
    if (!caseView || caseView.schemaVersion !== CASE_VIEW_V2_SCHEMA) {
      return null;
    }
    return {
      ...caseView,
      header: {
        ...caseView.header,
        statusCounts: caseView.header.statusCounts,
      },
    };
  }, [caseView]);

  const documentExplainers = useMemo(() => {
    if (!caseView || caseView.schemaVersion !== CASE_VIEW_V2_SCHEMA) {
      return [];
    }
    const domainPackId = resolveDomainPackId({
      intelligenceDomainId,
      domainLabel: summaryModel.domainLabel,
    });
    return buildRulebookDocumentExplainers({
      caseView,
      domainPackId,
      domainLabel: summaryModel.domainLabel,
    });
  }, [caseView, intelligenceDomainId, summaryModel.domainLabel]);

  const documentTabs = useMemo(
    () => documentExplainers.map((e) => ({ id: e.tabId as HiveCaseTab, label: e.tabLabel })),
    [documentExplainers],
  );

  const activeDocExplainer = useMemo(() => {
    if (!isDocumentExplainerTab(tab)) {
      return null;
    }
    return documentExplainers.find((e) => e.tabId === tab) ?? null;
  }, [documentExplainers, tab]);

  const meetingExtras = meetingQuestionsFromAnswers(summaryModel.decisions, answers);
  const prepWithExtras = useMemo(() => {
    if (!presentation) {
      return null;
    }
    if (meetingExtras.length === 0) {
      return presentation.prep;
    }
    return {
      ...presentation.prep,
      questions: [
        ...presentation.prep.questions,
        ...meetingExtras.map((text, i) => ({
          questionId: `unsure-${i}`,
          text,
          fromCardId: null,
          fromChecklistEntryId: null,
          itemIds: [],
        })),
      ],
    };
  }, [presentation, meetingExtras]);

  if (!presentation || !prepWithExtras) {
    return (
      <div data-testid="case-summary-experience" style={{ padding: 32, maxWidth: 560, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Rebuild your hive for the updated view</h1>
        <p style={{ color: "#5F6368" }}>
          This study was saved before the new case view. Run Build my hive again to see The story, Your plan,
          Timeline, and Meeting prep.
        </p>
      </div>
    );
  }

  const showMeetingQuestionsFromUnsure = meetingExtras.length > 0;

  return (
    <div data-testid="case-summary-experience">
      <HiveCaseLayout
        activeTab={tab}
        onTabChange={setTab}
        onProView={onProView}
        documentTabs={documentTabs}
      >
        {tab === "story" ? (
          <HiveCaseStoryView
            presentation={presentation}
            caseView={caseView}
            summaryModel={summaryModel}
            provenance={provenance}
            header={presentation.header}
            planCards={presentation.plan.cards}
            onOpenPanel={onOpenPanel}
            onGoTab={setTab}
            currentDecision={currentDecision}
            openDecisionsCount={openDecisions.length}
            decisionIndex={decisionIndex}
            decisionTotal={decisionTotal}
            onPickDecision={onPickDecision}
            onUnsureDecision={onUnsureDecision}
            extraMeetingQuestions={meetingExtras}
          />
        ) : null}
        {tab === "plan" ? (
          <HiveCasePlanView
            header={presentation.header}
            sections={presentation.plan.sections}
            cards={presentation.plan.cards}
            caseView={caseView}
            provenance={provenance}
            onOpenPanel={onOpenPanel}
            onGoTab={setTab}
          />
        ) : null}
        {tab === "timeline" ? (
          <HiveCaseTimelineView
            header={presentation.header}
            caseView={caseView}
            timeline={presentation.timeline}
            provenance={provenance}
            onOpenPanel={onOpenPanel}
          />
        ) : null}
        {tab === "meeting-prep" ? (
          <HiveCaseMeetingPrepView
            header={presentation.header}
            prep={prepWithExtras}
            showMeetingQuestionsFromUnsure={showMeetingQuestionsFromUnsure}
          />
        ) : null}
        {activeDocExplainer ? (
          <HiveCaseDocumentExplainerView explainer={activeDocExplainer} onOpenPanel={onOpenPanel} />
        ) : null}
      </HiveCaseLayout>
    </div>
  );
}
