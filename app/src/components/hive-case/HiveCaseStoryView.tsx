"use client";

import Link from "next/link";

import type { CaseHeader, CaseViewV2, PlanCard } from "@hiveforyou/shared/projections";
import type { ProvenanceIndex } from "@/lib/case/provenance-index";
import type { CaseSummaryPanelSpec } from "@/lib/case-summary/case-summary-evidence";
import { claimIdsForItemId } from "@/lib/case-summary/claim-ids-for-case-item";
import type { CaseSummaryDecision, CaseSummaryModel } from "@/lib/case-summary/case-summary-presentation";

import {
  PairEvidenceChip,
  SourceEvidenceChip,
} from "../case-summary/CaseSummaryChips";
import { HiveCaseClaimChips, HiveCaseChipButton } from "./HiveCaseEvidenceChip";
import { HiveCaseStatusBar } from "./HiveCaseStatusBar";
import { HiveCaseStatusBadge } from "./status-badge";
import type { HiveCaseTab } from "./hive-case-tokens";
import { shouldPreferPackForCaseView } from "@/lib/story/prefer-pack-narrative";

export function HiveCaseStoryView({
  presentation,
  caseView,
  summaryModel,
  provenance,
  header,
  planCards,
  onOpenPanel,
  onGoTab,
  currentDecision,
  openDecisionsCount,
  decisionIndex,
  decisionTotal,
  onPickDecision,
  onUnsureDecision,
  extraMeetingQuestions,
}: {
  presentation: Pick<CaseViewV2, "story" | "checklist" | "prep">;
  caseView: import("@hiveforyou/shared/projections").CaseViewV2 | null;
  summaryModel: CaseSummaryModel;
  provenance: ProvenanceIndex | null;
  header: CaseHeader;
  planCards: PlanCard[];
  onOpenPanel: (spec: CaseSummaryPanelSpec) => void;
  onGoTab: (tab: HiveCaseTab) => void;
  currentDecision: CaseSummaryDecision | null;
  openDecisionsCount: number;
  decisionIndex: number;
  decisionTotal: number;
  onPickDecision: (label: string) => void;
  onUnsureDecision: () => void;
  extraMeetingQuestions: string[];
}) {
  const packNarrative =
    caseView?.schemaVersion === "case-view/2" ? caseView.packNarrative : null;
  const validatedStory =
    caseView?.schemaVersion === "case-view/2" ? caseView.validatedStory : null;
  const validatedProse =
    validatedStory?.kind === "prose" ? validatedStory.story : null;
  const preferPackNarrative =
    caseView != null && shouldPreferPackForCaseView(caseView);
  const shortLines = presentation.story.filter(
    (l) => l.slotType !== "top_question" && l.slotType !== "stayed_same",
  );
  const topQuestion = presentation.story.find((l) => l.slotType === "top_question");
  /** Page headline already uses the pack opening line; label the story box distinctly. */
  const storyBoxTitle =
    header.headline.trim() === packNarrative?.opening?.trim()
      ? "The short version"
      : (packNarrative?.opening ?? "The short version");

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="hive-case-story">
        <span
          style={{
            alignSelf: "flex-start",
            padding: "4px 12px",
            borderRadius: 999,
            background: "#E8F0FE",
            color: "#1967D2",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {header.breadcrumb}
        </span>
        <h1
          data-testid="case-summary-headline"
          style={{
            margin: 0,
            fontSize: 36,
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          {header.headline}
        </h1>
        {header.currentPlanLabel ? (
          <p style={{ margin: 0, color: "#1967D2", fontSize: 14, fontWeight: 500 }}>{header.currentPlanLabel}</p>
        ) : null}
        <p style={{ margin: 0, color: "#5F6368", fontSize: 15 }}>
          {header.askedText ? (
            <>
              You asked: <span style={{ color: "#202124" }}>{header.askedText}</span>{" "}
            </>
          ) : null}
          Hive read {header.documentsRead} document{header.documentsRead === 1 ? "" : "s"}.
        </p>
        <HiveCaseStatusBar header={header} />
      </div>

      {currentDecision ? (
        <section
          className="ask"
          aria-label="Needs you"
          aria-live="polite"
          data-testid="case-summary-ask"
          style={{
            border: "1px solid #C6DAFC",
            borderRadius: 16,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#5F6368" }}>
            <span>{currentDecision.kind}</span>
            <span>
              {decisionIndex} of {decisionTotal}
            </span>
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{currentDecision.question}</h2>
          <p style={{ margin: 0, color: "#5F6368" }}>{currentDecision.context}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {currentDecision.options.map((option) => (
              <div key={option.claimId} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  data-testid="case-summary-decision-option"
                  onClick={() => onPickDecision(option.label)}
                  style={{
                    minHeight: 44,
                    padding: "0 18px",
                    border: "1px solid #DADCE0",
                    background: "#FFFFFF",
                    borderRadius: 999,
                    fontFamily: "inherit",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {option.label}
                </button>
                <SourceEvidenceChip claimId={option.claimId} provenance={provenance} onOpen={onOpenPanel} />
              </div>
            ))}
          </div>
          <button
            type="button"
            data-testid="case-summary-decision-unsure"
            onClick={onUnsureDecision}
            style={{
              alignSelf: "flex-start",
              background: "none",
              border: "none",
              color: "#1967D2",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 14,
            }}
          >
            Not sure — add it to my meeting questions
          </button>
        </section>
      ) : openDecisionsCount === 0 && summaryModel.decisions.length > 0 ? (
        <div
          data-testid="case-summary-clear"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            background: "#E6F4EA",
            borderRadius: 12,
            fontSize: 15,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="10" fill="#34A853" />
            <path
              d="m7.5 12.5 3 3 6-6.5"
              fill="none"
              stroke="#fff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Nothing needs you right now. Hive re-read the case with your answers.
        </div>
      ) : null}

      <section
        aria-labelledby="short-version"
        style={{
          border: "1px solid #E3E3E3",
          borderRadius: 16,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {validatedProse &&
        validatedProse.paragraphs.length > 0 &&
        !preferPackNarrative ? (
          <>
            <h2 id="short-version" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              {storyBoxTitle}
            </h2>
            {validatedProse.paragraphs.map((paragraph) => (
              <div key={paragraph.chapter} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {paragraph.sentences.map((sentence, sentenceIndex) => {
                  const isAsk = paragraph.chapter === "ask";
                  const text =
                    isAsk && sentence.text.startsWith("Worth asking:")
                      ? sentence.text.replace(/^Worth asking:\s*/, "")
                      : sentence.text;
                  const sentenceKey = `${paragraph.chapter}-${sentenceIndex}`;
                  return (
                    <div
                      key={sentenceKey}
                      style={{ display: "flex", flexDirection: "column", gap: 8 }}
                    >
                      <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55 }}>
                        {isAsk ? (
                          <>
                            <strong>Worth asking:</strong> {text}
                          </>
                        ) : (
                          text
                        )}
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {[...new Set(sentence.factIds)].map((claimId) => (
                          <HiveCaseClaimChips
                            key={`${sentenceKey}-${claimId}`}
                            claimIds={[claimId]}
                            provenance={provenance}
                            onOpen={onOpenPanel}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        ) : packNarrative && packNarrative.paragraphs.length > 0 ? (
          <>
            <h2 id="short-version" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              {storyBoxTitle}
            </h2>
            {packNarrative.paragraphs.map((paragraph) => (
              <div key={paragraph.chapter} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {paragraph.sentences.map((sentence) => {
                  const isAsk = paragraph.chapter === "ask";
                  const text =
                    isAsk && sentence.text.startsWith("Worth asking:")
                      ? sentence.text.replace(/^Worth asking:\s*/, "")
                      : sentence.text;
                  return (
                    <div
                      key={sentence.templateId}
                      style={{ display: "flex", flexDirection: "column", gap: 8 }}
                    >
                      <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55 }}>
                        {isAsk ? (
                          <>
                            <strong>Worth asking:</strong> {text}
                          </>
                        ) : (
                          text
                        )}
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {[...new Set(sentence.factIds)].map((claimId) => (
                          <HiveCaseClaimChips
                            key={`${sentence.templateId}-${claimId}`}
                            claimIds={[claimId]}
                            provenance={provenance}
                            onOpen={onOpenPanel}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        ) : (
          <>
            <h2 id="short-version" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              The short version
            </h2>
            {shortLines.map((line, lineIndex) => {
              const change = summaryModel.changes.find((c) => c.id === line.itemIds[0]);
              const claimIds = line.itemIds.flatMap((id) => claimIdsForItemId(caseView, id));
              return (
                <div
                  key={line.slotId}
                  data-testid={
                    line.slotType === "changed" &&
                    lineIndex === shortLines.findIndex((l) => l.slotType === "changed")
                      ? "case-summary-change"
                      : undefined
                  }
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <p style={{ margin: 0, fontSize: 17 }}>{line.text}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(() => {
                      const fromSummary = change?.fromClaimId && change.toClaimId ? change : null;
                      const changeItem = caseView?.items.find(
                        (i) => i.itemId === line.itemIds[0] && i.state === "changed",
                      );
                      const fromItem =
                        changeItem && changeItem.state === "changed"
                          ? {
                              fromClaimId: changeItem.series[0]?.claimId,
                              toClaimId: changeItem.series[changeItem.series.length - 1]?.claimId,
                              text: line.text,
                            }
                          : null;
                      const pair = fromSummary ?? fromItem;
                      if (pair?.fromClaimId && pair.toClaimId) {
                        return (
                          <PairEvidenceChip
                            claimIdA={pair.fromClaimId}
                            claimIdB={pair.toClaimId}
                            title={pair.text}
                            provenance={provenance}
                            onOpen={onOpenPanel}
                          />
                        );
                      }
                      return (
                        <>
                          {line.chips.map((chip) => (
                            <HiveCaseChipButton key={chip.evidenceId} chip={chip} />
                          ))}
                          <HiveCaseClaimChips
                            claimIds={claimIds}
                            provenance={provenance}
                            onOpen={onOpenPanel}
                            pairTitle={line.text}
                          />
                        </>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
            {topQuestion ? (
              <div
                style={{
                  background: "#E8F0FE",
                  borderRadius: 12,
                  padding: "16px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1967D2" }}>
                  Worth raising at the meeting
                </span>
                <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{topQuestion.text}</p>
              </div>
            ) : null}
          </>
        )}
      </section>

      {planCards.length > 0 ? (
        <section aria-labelledby="glance" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <h2 id="glance" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              Your plan at a glance
            </h2>
            <button
              type="button"
              onClick={() => onGoTab("plan")}
              style={{
                fontSize: 14,
                fontWeight: 600,
                minHeight: 44,
                background: "none",
                border: "none",
                color: "#1967D2",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Browse your plan →
            </button>
          </div>
          <div style={{ border: "1px solid #E3E3E3", borderRadius: 16, overflow: "hidden" }}>
            {planCards.slice(0, 6).map((card, index) => (
              <button
                key={card.cardId}
                type="button"
                data-testid={index === 0 && card.status === "changed" ? "case-summary-change" : undefined}
                onClick={() => onGoTab("plan")}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "16px 20px",
                  borderBottom: "1px solid #EDEDED",
                  textDecoration: "none",
                  color: "#202124",
                  background: "#FFFFFF",
                  border: "none",
                  borderBottomWidth: 1,
                  borderBottomStyle: "solid",
                  borderBottomColor: "#EDEDED",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 600 }}>{card.title}</span>
                  <span style={{ fontSize: 14, color: "#5F6368" }}>{card.oneLiner}</span>
                </div>
                <HiveCaseStatusBadge status={card.status} />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="docs" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 id="docs" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
          Your documents
        </h2>
        <div style={{ border: "1px solid #E3E3E3", borderRadius: 16, padding: "8px 20px" }}>
          {presentation.checklist
            .filter((e) => e.status === "have")
            .map((entry) => (
              <div
                key={entry.entryId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid #EDEDED",
                }}
              >
                <CheckIcon />
                <span style={{ flex: "1 1 auto" }}>{entry.label}</span>
              </div>
            ))}
          {presentation.checklist
            .filter((e) => e.status === "missing")
            .map((entry) => (
              <div
                key={entry.entryId}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 0",
                  borderBottom: "1px solid #EDEDED",
                }}
              >
                <MissingIcon />
                <div style={{ flex: "1 1 360px", display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 600 }}>{entry.label}</span>
                  {entry.reason ? (
                    <span style={{ fontSize: 14, color: "#5F6368" }}>{entry.reason}</span>
                  ) : null}
                </div>
                <Link
                  href="/"
                  style={{
                    minHeight: 40,
                    padding: "0 16px",
                    border: "1px solid #DADCE0",
                    background: "#FFFFFF",
                    color: "#1967D2",
                    borderRadius: 999,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  Add file
                </Link>
              </div>
            ))}
        </div>
      </section>

      {extraMeetingQuestions.length > 0 ? (
        <section
          aria-label="Meeting questions"
          data-testid="case-summary-meeting-questions"
          style={{ border: "1px solid #E3E3E3", borderRadius: 16, padding: 24 }}
        >
          <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700 }}>To ask at the meeting</h2>
          {extraMeetingQuestions.map((q) => (
            <p key={q} style={{ margin: "8px 0 0", fontWeight: 600 }}>
              {q}
            </p>
          ))}
        </section>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <button
          type="button"
          onClick={() => onGoTab("meeting-prep")}
          style={{
            minHeight: 48,
            padding: "0 22px",
            borderRadius: 999,
            background: "#202124",
            color: "#FFFFFF",
            fontWeight: 600,
            fontSize: 15,
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Get my meeting prep
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "#5F6368" }}>
        Every sentence points to the page it came from. This describes your documents. It isn&apos;t legal advice.
      </p>
    </>
  );
}

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#188038"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function MissingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EA4335" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}
