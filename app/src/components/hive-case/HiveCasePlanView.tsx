"use client";

import type { CaseHeader, CaseViewV2, PlanCard, PlanSection } from "@hiveforyou/shared/projections";
import type { ProvenanceIndex } from "@/lib/case/provenance-index";
import type { CaseSummaryPanelSpec } from "@/lib/case-summary/case-summary-evidence";
import { claimIdsForItemId } from "@/lib/case-summary/claim-ids-for-case-item";

import { HiveCaseClaimChips } from "./HiveCaseEvidenceChip";
import { HiveCaseStatusBadge } from "./status-badge";
import type { HiveCaseTab } from "./hive-case-tokens";

export function HiveCasePlanView({
  header,
  sections,
  cards,
  caseView,
  provenance,
  onOpenPanel,
  onGoTab,
}: {
  header: CaseHeader;
  sections: PlanSection[];
  cards: PlanCard[];
  caseView: CaseViewV2 | null;
  provenance: ProvenanceIndex | null;
  onOpenPanel: (spec: CaseSummaryPanelSpec) => void;
  onGoTab: (tab: HiveCaseTab) => void;
}) {
  const cardsById = new Map(cards.map((c) => [c.cardId, c]));

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
        <h1 style={{ margin: 0, fontSize: 36, lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Your plan
        </h1>
        <p style={{ margin: 0, color: "#5F6368" }}>
          {header.currentPlanLabel
            ? `${header.currentPlanLabel}. What the new IEP says, part by part.`
            : "What the new IEP says, part by part. Open one to see the page and what to ask."}
        </p>
      </div>

      {sections.map((section) => {
        const sectionCards = section.cardIds.map((id) => cardsById.get(id)).filter(Boolean) as PlanCard[];
        if (sectionCards.length === 0 && section.sectionId !== "dates") {
          return null;
        }
        return (
          <section key={section.sectionId} aria-labelledby={section.sectionId} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2
              id={section.sectionId}
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: "#5F6368",
              }}
            >
              {section.label}
            </h2>
            {section.sectionId === "dates" && sectionCards.length === 0 ? (
              <div
                style={{
                  border: "1px solid #E3E3E3",
                  borderRadius: 16,
                  padding: "18px 22px",
                  color: "#5F6368",
                  fontSize: 15,
                }}
              >
                Key dates appear here when your documents include them.
              </div>
            ) : null}
            {sectionCards.map((card, index) => {
              const claimIds = card.itemIds.flatMap((id) => claimIdsForItemId(caseView, id));
              const isFeatured = card.status === "worth_a_question" || card.status === "changed";
              if (isFeatured && section.sectionId === "goals") {
                return (
                  <article
                    key={card.cardId}
                    data-testid={card.status === "changed" && index === 0 ? "case-summary-change" : undefined}
                    style={{
                      border: "1px solid #C6DAFC",
                      borderRadius: 16,
                      padding: "22px 24px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>{card.title}</h3>
                        <span style={{ fontSize: 15, color: "#5F6368" }}>{card.oneLiner}</span>
                      </div>
                      <HiveCaseStatusBadge status={card.status} />
                    </div>
                    {card.whyLine ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#5F6368" }}>Why it&apos;s worth a question</span>
                        <p style={{ margin: 0 }}>{card.whyLine}</p>
                        <HiveCaseClaimChips claimIds={claimIds} provenance={provenance} onOpen={onOpenPanel} />
                      </div>
                    ) : null}
                    {card.whyLine ? (
                      <div
                        style={{
                          background: "#E8F0FE",
                          borderRadius: 12,
                          padding: "14px 16px",
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#1967D2" }}>Worth asking</span>
                        <p style={{ margin: "4px 0 0", fontWeight: 600 }}>{card.whyLine}</p>
                      </div>
                    ) : null}
                  </article>
                );
              }
              return (
                <div
                  key={card.cardId}
                  style={{
                    border: "1px solid #E3E3E3",
                    borderRadius: 16,
                    padding: "18px 22px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>{card.title}</span>
                    <span style={{ fontSize: 15, color: "#5F6368" }}>{card.oneLiner}</span>
                    {card.sinceLine ? (
                      <span style={{ fontSize: 13, color: "#5F6368", paddingTop: 4 }}>{card.sinceLine}</span>
                    ) : null}
                  </div>
                  <HiveCaseStatusBadge status={card.status} />
                </div>
              );
            })}
          </section>
        );
      })}

      <button
        type="button"
        onClick={() => onGoTab("timeline")}
        style={{
          alignSelf: "flex-start",
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
        See the full timeline →
      </button>
    </>
  );
}
