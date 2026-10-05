"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, type ReactNode } from "react";

import type { CaseHeader, CaseTimeline, CaseViewV2 } from "@hiveforyou/shared/projections";

import {
  buildFluencyChart,
  buildTimelineDisplay,
  formatDisplayDate,
  type FluencyChartModel,
  type TimelineDisplayEntry,
  type TimelineFactTag,
} from "@/lib/case/timeline-display";
import type { ProvenanceIndex } from "@/lib/case/provenance-index";
import type { CaseSummaryPanelSpec } from "@/lib/case-summary/case-summary-evidence";

import { hiveCaseFont, hiveCaseMono } from "./hive-case-tokens";

const tagStyles: Record<TimelineFactTag, { bg: string; color: string }> = {
  changed: { bg: "#FEF6D8", color: "#7A5200" },
  new: { bg: "#E8F0FE", color: "#1A56C4" },
  dropped: { bg: "#F1F3F4", color: "#3C4043" },
  same: { bg: "#E6F4EA", color: "#137333" },
  notmet: { bg: "#FCE8E6", color: "#A50E0E" },
};

const tagLabels: Record<TimelineFactTag, string> = {
  changed: "Changed",
  new: "New",
  dropped: "Dropped",
  same: "Same",
  notmet: "Not met",
};

function FluencyMeasureChart({ model }: { model: FluencyChartModel }) {
  const width = 640;
  const height = 150;
  const padX = 48;
  const padTop = 36;
  const padBottom = 28;
  const chartW = width - padX - 20;
  const chartH = height - padTop - padBottom;

  const values = model.points.map((p) => p.value);
  const minV = Math.min(...values, model.targetValue ?? values[0]!);
  const maxV = Math.max(...values, model.targetValue ?? values[0]!);
  const span = Math.max(maxV - minV, 1);

  const xAt = (i: number) => padX + (i / Math.max(model.points.length - 1, 1)) * chartW;
  const yAt = (v: number) => padTop + chartH - ((v - minV) / span) * chartH;

  const linePath = model.points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(p.value)}`)
    .join(" ");

  const targetY = model.targetValue != null ? yAt(model.targetValue) : null;

  return (
    <section
      aria-label={model.measureLabel}
      style={{
        border: "1px solid #E6E8EB",
        borderRadius: 18,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{model.measureLabel}</h2>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={model.measureLabel}>
        {targetY != null ? (
          <>
            <line x1={padX} x2={width - 20} y1={targetY} y2={targetY} stroke="#34A853" strokeDasharray="4 4" />
            <text
              x={width - 20}
              y={targetY - 7}
              textAnchor="end"
              fontSize={11}
              fill="#137333"
              style={{ fontFamily: hiveCaseMono }}
            >
              {model.targetLabel ?? "Goal"}
            </text>
          </>
        ) : null}
        <path d={linePath} fill="none" stroke="#4285F4" strokeWidth={2.5} />
        {model.points.map((p, i) => (
          <g key={`${p.date}-${p.value}`}>
            <circle cx={xAt(i)} cy={yAt(p.value)} r={5} fill="#fff" stroke="#4285F4" strokeWidth={2.5} />
            <text
              x={xAt(i)}
              y={yAt(p.value) - 10}
              textAnchor="middle"
              fontSize={12}
              fill="#14181F"
              style={{ fontFamily: hiveCaseMono }}
            >
              {p.value}
            </text>
            <text
              x={xAt(i)}
              y={height - 6}
              textAnchor="middle"
              fontSize={10.5}
              fill="#5C6673"
              style={{ fontFamily: hiveCaseMono }}
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      <p style={{ margin: 0, fontSize: 13.5, color: "#5C6673" }}>{model.caveat}</p>
    </section>
  );
}

function TimelineTag({ tag }: { tag: TimelineFactTag }) {
  const s = tagStyles[tag];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 12,
        fontWeight: 600,
        padding: "2px 9px",
        borderRadius: 999,
        marginLeft: 6,
        background: s.bg,
        color: s.color,
      }}
    >
      {tagLabels[tag]}
    </span>
  );
}

export function HiveCaseTimelineView({
  header,
  caseView,
  timeline,
  provenance,
  onOpenPanel,
}: {
  header: CaseHeader;
  caseView: CaseViewV2 | null;
  timeline: CaseTimeline;
  provenance: ProvenanceIndex | null;
  onOpenPanel: (spec: CaseSummaryPanelSpec) => void;
}) {
  const [showAllDetail, setShowAllDetail] = useState(false);

  const { entries, fluency } = useMemo(
    () => buildTimelineDisplay({ caseView, timeline, provenance }),
    [caseView, timeline, provenance],
  );

  const chartModel = useMemo(() => fluency ?? (caseView ? buildFluencyChart(caseView) : null), [fluency, caseView]);

  const rowsWithYears = useMemo(() => {
    let lastYear = "";
    return entries.map((entry) => {
      if (entry.kind === "gap") {
        return { entry, yearHeader: null as ReactNode };
      }
      const year = entry.date.slice(0, 4);
      const yearHeader =
        year !== lastYear ? (
          <div
            style={{
              fontFamily: hiveCaseMono,
              fontSize: 12,
              letterSpacing: "0.08em",
              color: "#5C6673",
              margin: "6px 0 -6px 0",
            }}
          >
            {year}
          </div>
        ) : null;
      lastYear = year;
      return { entry, yearHeader };
    });
  }, [entries]);

  return (
    <div
      style={{
        fontFamily: hiveCaseFont,
        color: "#14181F",
        maxWidth: 760,
        margin: "0 auto",
        padding: "36px 20px 80px",
        display: "flex",
        flexDirection: "column",
        gap: 26,
      }}
      data-testid="hive-case-timeline"
    >
      <span
        style={{
          alignSelf: "flex-start",
          fontSize: 13,
          padding: "5px 12px",
          borderRadius: 999,
          background: "#E8F0FE",
          color: "#1A56C4",
        }}
      >
        {header.breadcrumb}
      </span>
      <div>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em" }}>Timeline</h1>
        <p style={{ margin: "4px 0 0", color: "#5C6673", fontSize: 16 }}>
          What happened, when, and what changed — one entry per document.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          role="group"
          aria-label="Level of detail"
          style={{
            display: "inline-flex",
            padding: 3,
            borderRadius: 999,
            background: "#F1F3F4",
            gap: 2,
          }}
        >
          <button
            type="button"
            aria-pressed={!showAllDetail}
            onClick={() => setShowAllDetail(false)}
            style={{
              fontSize: 13.5,
              fontWeight: 500,
              color: !showAllDetail ? "#14181F" : "#3C4043",
              background: !showAllDetail ? "#fff" : "transparent",
              border: 0,
              borderRadius: 999,
              padding: "7px 14px",
              minHeight: 36,
              cursor: "pointer",
              boxShadow: !showAllDetail ? "0 1px 3px rgba(0,0,0,.12)" : undefined,
            }}
          >
            Key moments
          </button>
          <button
            type="button"
            aria-pressed={showAllDetail}
            onClick={() => setShowAllDetail(true)}
            style={{
              fontSize: 13.5,
              fontWeight: 500,
              color: showAllDetail ? "#14181F" : "#3C4043",
              background: showAllDetail ? "#fff" : "transparent",
              border: 0,
              borderRadius: 999,
              padding: "7px 14px",
              minHeight: 36,
              cursor: "pointer",
              boxShadow: showAllDetail ? "0 1px 3px rgba(0,0,0,.12)" : undefined,
            }}
          >
            Every detail
          </button>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, color: "#5C6673" }}>
          {(["changed", "new", "dropped", "same"] as TimelineFactTag[]).map((tag) => (
            <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <TimelineTag tag={tag} />
            </span>
          ))}
        </div>
      </div>

      {chartModel ? <FluencyMeasureChart model={chartModel} /> : null}

      {entries.length === 0 ? (
        <p style={{ color: "#5C6673" }}>Add documents with dates to build your timeline.</p>
      ) : (
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            paddingLeft: 28,
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 9,
              top: 8,
              bottom: 8,
              width: 2,
              background: "#E6E8EB",
              borderRadius: 2,
            }}
          />
          {rowsWithYears.map(({ entry, yearHeader }) => {
            if (entry.kind === "gap") {
              return (
                <div
                  key={`gap-${entry.from}-${entry.to}`}
                  role="note"
                  style={{
                    position: "relative",
                    border: "1.5px dashed #F2B8B5",
                    background: "#FFF8F7",
                    borderRadius: 18,
                    padding: "14px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: -25,
                      top: 18,
                      width: 12,
                      height: 12,
                      borderRadius: 999,
                      background: "#fff",
                      border: "2.5px dashed #EA4335",
                    }}
                  />
                  <b style={{ color: "#A50E0E", fontSize: 15 }}>{entry.months} months with no documents</b>
                  <span style={{ fontSize: 14, color: "#5C6673" }}>
                    {entry.from} – {entry.to}. Plans or progress reports from this period aren’t in what you uploaded.
                  </span>
                  <Link
                    href="/"
                    style={{
                      alignSelf: "flex-start",
                      marginTop: 6,
                      fontSize: 14,
                      fontWeight: 500,
                      padding: "8px 14px",
                      minHeight: 40,
                      borderRadius: 999,
                      border: "1px solid #E1E4E8",
                      background: "#fff",
                      color: "#14181F",
                      textDecoration: "none",
                    }}
                  >
                    Add documents
                  </Link>
                </div>
              );
            }

            return (
              <TimelineDocCard
                key={entry.logicalDocumentId}
                entry={entry}
                yearHeader={yearHeader}
                showAllDetail={showAllDetail}
                onOpenPanel={onOpenPanel}
              />
            );
          })}
        </div>
      )}

      <p style={{ margin: 0, fontSize: 13, color: "#5C6673" }}>
        Dates come from your documents. Where a document gives only a year, the timeline shows only the year.
      </p>
    </div>
  );
}

function TimelineDocCard({
  entry,
  yearHeader,
  showAllDetail,
  onOpenPanel,
}: {
  entry: Extract<TimelineDisplayEntry, { kind: "document" }>;
  yearHeader: ReactNode;
  showAllDetail: boolean;
  onOpenPanel: (spec: CaseSummaryPanelSpec) => void;
}) {
  return (
    <>
      {yearHeader}
      <article
        style={{
          position: "relative",
          border: "1px solid #E6E8EB",
          borderRadius: 18,
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          background: "#fff",
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: -25,
            top: 22,
            width: 12,
            height: 12,
            borderRadius: 999,
            background: entry.plan ? "#14181F" : "#fff",
            border: `2.5px solid ${entry.change ? "#E8A317" : "#14181F"}`,
            ...(entry.change ? { background: "#FEF6D8" } : {}),
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{entry.title}</h3>
          <span style={{ fontFamily: hiveCaseMono, fontSize: 12.5, color: "#5C6673" }}>
            {formatDisplayDate(entry.date)}
          </span>
        </div>
        {entry.subtitle ? (
          <span style={{ fontFamily: hiveCaseMono, fontSize: 12.5, color: "#5C6673", marginTop: -8 }}>
            {entry.subtitle}
          </span>
        ) : null}
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {entry.keyFacts.map((fact) => (
            <li
              key={`${fact.text}-${fact.page ?? 0}`}
              style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 15 }}
            >
              <span
                aria-hidden
                style={{
                  flex: "none",
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: "#9AA0A6",
                  transform: "translateY(-3px)",
                }}
              />
              <span>
                {fact.text}
                {fact.tag ? <TimelineTag tag={fact.tag} /> : null}
              </span>
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {entry.pages.map((page) => (
            <button
              key={`${entry.logicalDocumentId}-p${page}`}
              type="button"
              onClick={() => {
                const claimId = entry.claimIds[0];
                if (claimId) {
                  onOpenPanel({ t: "one", claimId });
                }
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: hiveCaseMono,
                fontSize: 12,
                padding: "4px 9px",
                minHeight: 28,
                borderRadius: 8,
                background: "#FBF4E2",
                border: "1px solid #EBDDB4",
                color: "#3D3000",
                cursor: "pointer",
              }}
            >
              {entry.docLabel} · p.{page}
            </button>
          ))}
        </div>
        {showAllDetail && entry.allFacts.length > 0 ? (
          <div
            style={{
              borderTop: "1px dashed #E6E8EB",
              paddingTop: 10,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: "4px 14px",
              fontSize: 13.5,
            }}
          >
            {entry.allFacts.map((row) => (
              <Fragment key={`${row.label}-${row.value}`}>
                <span style={{ color: "#5C6673" }}>{row.label}</span>
                <span style={{ fontFamily: hiveCaseMono, fontSize: 12.5, textAlign: "right" }}>
                  {row.value}
                </span>
              </Fragment>
            ))}
          </div>
        ) : null}
      </article>
    </>
  );
}
