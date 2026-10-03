"use client";

import type { CaseHeader, MeetingPrep } from "@hiveforyou/shared/projections";

export function HiveCaseMeetingPrepView({
  header,
  prep,
  showMeetingQuestionsFromUnsure,
}: {
  header: CaseHeader;
  prep: MeetingPrep;
  showMeetingQuestionsFromUnsure?: boolean;
}) {
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
          Meeting prep
        </h1>
        <p style={{ margin: 0, color: "#5F6368" }}>
          What to ask and what to bring. Ready on your phone when you walk in.
        </p>
      </div>

      <section
        aria-labelledby="ask"
        style={{
          border: "1px solid #E3E3E3",
          borderRadius: 16,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
        data-testid={showMeetingQuestionsFromUnsure || prep.questions.length > 0 ? "case-summary-meeting-questions" : undefined}
      >
        <h2 id="ask" style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700 }}>
          Ask
        </h2>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
          {prep.questions.map((q, i) => (
            <li
              key={q.questionId}
              style={{
                display: "flex",
                gap: 14,
                padding: "14px 0",
                borderBottom: i < prep.questions.length - 1 ? "1px solid #EDEDED" : undefined,
              }}
            >
              <span
                style={{
                  flex: "none",
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "#E8F0FE",
                  color: "#1967D2",
                  fontWeight: 700,
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {i + 1}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 17, fontWeight: 600 }}>{q.text}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {prep.stayedSame ? (
        <section
          aria-labelledby="same"
          style={{
            background: "#E6F4EA",
            borderRadius: 16,
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <h2 id="same" style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            Stayed the same
          </h2>
          <p style={{ margin: 0, fontSize: 15 }}>{prep.stayedSame.text}</p>
        </section>
      ) : null}

      {prep.bring.length > 0 ? (
        <section
          aria-labelledby="bring"
          style={{
            border: "1px solid #E3E3E3",
            borderRadius: 16,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <h2 id="bring" style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700 }}>
            Bring
          </h2>
          {prep.bring.map((row, i) => (
            <div
              key={`${row.label}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: i < prep.bring.length - 1 ? "1px solid #EDEDED" : undefined,
              }}
            >
              <input type="checkbox" readOnly style={{ width: 20, height: 20, accentColor: "#1967D2" }} />
              <label style={{ flex: "1 1 auto" }}>{row.label}</label>
            </div>
          ))}
        </section>
      ) : null}

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label htmlFor="hive-case-notes" style={{ fontSize: 20, fontWeight: 700 }}>
          Your notes
        </label>
        <textarea
          id="hive-case-notes"
          placeholder="Anything you want to remember to say…"
          style={{
            minHeight: 120,
            padding: "14px 16px",
            border: "1px solid #DADCE0",
            borderRadius: 16,
            fontFamily: "inherit",
            fontSize: 16,
            color: "#202124",
            resize: "vertical",
          }}
        />
      </section>
    </>
  );
}
