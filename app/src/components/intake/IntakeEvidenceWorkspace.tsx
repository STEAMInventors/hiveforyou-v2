"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { formatFileSize } from "@/lib/format-file-metadata";
import { commitStagedDocuments } from "@/lib/documents/commit-client";
import {
  appendIntakeSources,
  fetchIntakeRun,
  resetIntakeHomeSession,
  setIntakeSourceDisposition,
  startIntakeStudy,
} from "@/lib/intake/intake-client";
import { useStagedDocuments } from "@/lib/intake/staged-documents-context";
import { HiveBuildingModal } from "@/components/hive/HiveBuildingModal";
import { BuildingHiveSvg } from "@/components/hive-lifecycle/BuildingHiveSvg";
import { LifecycleRail } from "@/components/hive-lifecycle/LifecycleRail";
import { StageList } from "@/components/hive-lifecycle/StageList";
import {
  MODAL2_PHASES,
  useHeldPhase,
  useLifecycleModalEffects,
  type Modal2Phase,
} from "@/components/hive-lifecycle/stages";
import { ACCEPTED_UPLOAD_MIME } from "@/lib/upload-constants";
import type { IntakeEvidenceWorkspaceView, IntakeSourceFileView } from "@hiveforyou/shared/intake";

const geist = "'Geist', 'Helvetica Neue', sans-serif";
const ibmMono = "'IBM Plex Mono', monospace";

const HIVE_READ_COLOR: Record<string, string> = {
  IEP: "#4285F4",
  "Eligibility Determination": "#FBBC05",
  "Progress Report": "#EA4335",
  "Evaluation Plan": "#34A853",
  "Psychoeducational Evaluation": "#34A853",
  "Academic Evaluation": "#34A853",
  "Speech-Language Evaluation": "#34A853",
};

function hiveReadAsLabel(file: IntakeSourceFileView): string {
  const active = file.logicalDocuments.filter(
    (doc) => doc.processingDisposition !== "DO_NOT_PROCESS",
  );
  if (active.length === 1) {
    return active[0]?.customerLabel ?? file.documentTypeSummary;
  }
  return file.documentTypeSummary;
}

function hiveReadAsColor(label: string): string {
  if (HIVE_READ_COLOR[label]) {
    return HIVE_READ_COLOR[label]!;
  }
  if (/Evaluation/.test(label)) {
    return "#34A853";
  }
  return "#9AA0A6";
}

function buildSummary(files: IntakeSourceFileView[]): string {
  const included = files.filter((file) => file.disposition === "PRESENT");
  const iep = included.filter((file) => hiveReadAsLabel(file) === "IEP").length;
  const ev = included.filter((file) => /Evaluation/.test(hiveReadAsLabel(file))).length;
  return `${included.length} of ${files.length} files included · ${iep} IEP${iep === 1 ? "" : "s"} · ${ev} evaluation${ev === 1 ? "" : "s"}`;
}

function FileIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#5F6368"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function SourceFileRow({
  file,
  excluded,
  onToggleInclude,
  toggling,
}: {
  file: IntakeSourceFileView;
  excluded: boolean;
  onToggleInclude: () => void;
  toggling: boolean;
}) {
  const readAs = hiveReadAsLabel(file);
  const dotColor = hiveReadAsColor(readAs);
  const sizeLabel = formatFileSize(file.sizeBytes);

  return (
    <div
      className="frow"
      data-testid="intake-source-file-row"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 210px 120px",
        gap: 16,
        alignItems: "center",
        padding: "12px 22px",
        borderBottom: "1px solid #F1F3F4",
        background: "#FFFFFF",
        opacity: excluded ? 0.5 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <span
          style={{
            width: 36,
            height: 36,
            flex: "none",
            borderRadius: 10,
            background: "#F8F9FA",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FileIcon />
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: ibmMono,
              fontSize: 13.5,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {file.filename}
          </div>
          <div style={{ fontSize: 12.5, color: "#5F6368" }}>
            {file.fileTypeLabel} · {sizeLabel}
            {excluded ? " · left out of this study" : ""}
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 14,
          color: "#3C4043",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            flex: "none",
            background: dotColor,
          }}
        />
        {readAs}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {excluded ? (
          <button
            type="button"
            className="undo"
            data-testid="intake-add-back"
            disabled={toggling}
            onClick={onToggleInclude}
            style={{
              fontFamily: geist,
              fontSize: 13,
              fontWeight: 500,
              padding: "7px 12px",
              minHeight: 36,
              borderRadius: 999,
              border: "1px solid #E3E3E3",
              background: "#FFFFFF",
              color: "#3C4043",
              cursor: toggling ? "wait" : "pointer",
            }}
          >
            Add back
          </button>
        ) : (
          <button
            type="button"
            className="rm"
            data-testid="intake-remove-from-analysis"
            disabled={toggling}
            onClick={onToggleInclude}
            style={{
              fontFamily: geist,
              fontSize: 13,
              fontWeight: 500,
              padding: "7px 12px",
              minHeight: 36,
              borderRadius: 999,
              border: 0,
              background: "transparent",
              color: "#5F6368",
              cursor: toggling ? "wait" : "pointer",
            }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

const STUDY_PRESENTATION: Record<
  Modal2Phase,
  {
    cardClass: string;
    current: number;
    finishedThrough: number;
    title: string;
    subtitle: string;
  }
> = {
  migration: {
    cardClass: "p-migration",
    current: 2,
    finishedThrough: 1,
    title: "Building your hive",
    subtitle: "Step 2 of 2 · usually about two minutes.",
  },
  resolution: {
    cardClass: "p-resolution",
    current: 3,
    finishedThrough: 2,
    title: "Building your hive",
    subtitle: "Step 2 of 2 · settling into place.",
  },
  complete: {
    cardClass: "p-resolution done2",
    current: 4,
    finishedThrough: 3,
    title: "Your hive is ready",
    subtitle: "Every finding links back to the page it came from.",
  },
};

function StudyLifecycleModal({
  target,
  onOpenHive,
}: {
  target: Modal2Phase;
  onOpenHive: () => void;
}) {
  const shown = useHeldPhase(target, MODAL2_PHASES);
  const openRef = useRef<HTMLButtonElement>(null);
  const complete = shown === "complete";
  useLifecycleModalEffects(!complete, openRef);
  const presentation = STUDY_PRESENTATION[shown];

  return (
    <div className="hive-lifecycle overlay" data-testid="intake-study-building-modal">
      <div
        className={`card ${presentation.cardClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-lifecycle-title"
        aria-busy={!complete}
      >
        <LifecycleRail current={presentation.current} finishedThrough={presentation.finishedThrough} />
        <BuildingHiveSvg />
        <div>
          <h2 id="study-lifecycle-title">{presentation.title}</h2>
          <p className="sub">{presentation.subtitle}</p>
        </div>
        <StageList
          stages={[2, 3]}
          current={presentation.current}
          finishedThrough={presentation.finishedThrough}
        />
        {complete ? (
          <div className="actions">
            <button ref={openRef} type="button" className="btn dark" onClick={onOpenHive}>
              Open my hive
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function IntakeEvidenceWorkspace({ intakeRunId }: { intakeRunId: string }) {
  const router = useRouter();
  const { clearDocuments } = useStagedDocuments();
  const addFilesInputId = useId();
  const addFilesRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<IntakeEvidenceWorkspaceView | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [addingFiles, setAddingFiles] = useState(false);
  const [studyBuild, setStudyBuild] = useState<{
    session: number;
    target: Modal2Phase;
    studyRunId?: string;
  } | null>(null);
  const studyStartInFlight = useRef(false);
  const [dragOver, setDragOver] = useState(false);

  const reload = useCallback(async () => {
    const next = await fetchIntakeRun(intakeRunId);
    setView(next);
    return next;
  }, [intakeRunId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const next = await fetchIntakeRun(intakeRunId);
        if (!cancelled) {
          setView(next);
        }
      } catch {
        if (!cancelled) {
          setErrorMessage("We couldn't load your documents. Please try again.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [intakeRunId]);

  const handleAddFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      setAddingFiles(true);
      setErrorMessage(null);
      try {
        const staged = files.map((file, index) => ({
          id: `local-${Date.now()}-${index}`,
          file,
        }));
        const committed = await commitStagedDocuments(staged);
        await appendIntakeSources(
          intakeRunId,
          committed.documents.map((document) => document.sourceDocumentId),
        );
        let attempts = 0;
        while (attempts < 120) {
          const next = await reload();
          if (next.status !== "RUNNING" && next.workspaceReady) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
          attempts += 1;
        }
      } catch {
        setErrorMessage("We couldn't add those files. Please try again.");
      } finally {
        setAddingFiles(false);
      }
    },
    [intakeRunId, reload],
  );

  useEffect(() => {
    if (!view) {
      return;
    }

    function onDragOver(event: DragEvent) {
      if (!event.dataTransfer?.types.includes("Files")) {
        return;
      }
      event.preventDefault();
      setDragOver(true);
    }

    function onDragLeave(event: DragEvent) {
      if (event.relatedTarget && document.contains(event.relatedTarget as Node)) {
        return;
      }
      setDragOver(false);
    }

    function onDrop(event: DragEvent) {
      event.preventDefault();
      setDragOver(false);
      const list = event.dataTransfer?.files;
      if (list?.length) {
        void handleAddFiles(Array.from(list));
      }
    }

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [view, handleAddFiles]);

  const handleToggleInclude = async (file: IntakeSourceFileView) => {
    const nextDisposition = file.disposition === "PRESENT" ? "DISCARDED" : "PRESENT";
    setToggling(file.sourceDocumentId);
    setErrorMessage(null);
    try {
      const next = await setIntakeSourceDisposition(
        intakeRunId,
        file.sourceDocumentId,
        nextDisposition,
      );
      setView(next);
    } catch {
      setErrorMessage("We couldn't update that file. Please try again.");
    } finally {
      setToggling(null);
    }
  };

  const shellStyle = {
    minHeight: "100vh",
    background: dragOver ? "#F8F9FA" : "#FFFFFF",
    color: "#0D0D0D",
    fontFamily: geist,
    fontSize: 16,
    lineHeight: 1.5,
  } as const;

  if (errorMessage && !view) {
    return (
      <div className="intake-docs" style={shellStyle} data-testid="intake-evidence-workspace">
        <main style={{ maxWidth: 860, margin: "0 auto", padding: "48px 20px" }}>
          <p style={{ textAlign: "center", color: "#1A56C4" }} role="alert">
            {errorMessage}
          </p>
        </main>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="intake-docs" style={shellStyle} data-testid="intake-evidence-workspace" aria-busy="true">
        <HiveBuildingModal
          phase="intake"
          activeStepIndex={0}
          animationKey={`intake-load-${intakeRunId}`}
          overlayTestId="intake-evidence-loading-modal"
          headingTestId="intake-heading"
        />
      </div>
    );
  }

  const files = [...view.sourceFiles].sort((a, b) => a.filename.localeCompare(b.filename));
  const includedCount = files.filter((file) => file.disposition === "PRESENT").length;
  const domainLabel = view.purpose.domainName ?? "General";

  return (
    <div className="intake-docs" style={shellStyle} data-testid="intake-evidence-workspace">
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          padding: "14px 20px",
          borderBottom: "1px solid #F1F3F4",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "#0D0D0D",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
            <path d="M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25z" fill="#0D0D0D" />
            <path
              d="M11 13.5h10M11 18.5h6"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span style={{ fontWeight: 600, fontSize: 17, letterSpacing: "-0.02em" }}>
            HiveForYou
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Link
            href="#help"
            className="ghost"
            style={{
              fontSize: 14,
              textDecoration: "none",
              padding: "9px 14px",
              borderRadius: 999,
            }}
          >
            Help
          </Link>
          <button
            type="button"
            aria-label="Account"
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              border: 0,
              background: "#E8F0FE",
              color: "#1A56C4",
              fontFamily: geist,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            JD
          </button>
        </div>
      </header>

      <main
        style={{
          maxWidth: 860,
          margin: "0 auto",
          padding: "48px 20px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "#E8F0FE",
                  color: "#1A56C4",
                }}
              >
                {domainLabel}
              </span>
              <button
                type="button"
                className="chg"
                data-testid="intake-purpose-change"
                onClick={() => {
                  resetIntakeHomeSession();
                  clearDocuments();
                  router.push("/");
                }}
                style={{
                  fontFamily: geist,
                  fontSize: 13,
                  fontWeight: 500,
                  padding: "6px 12px",
                  minHeight: 32,
                  borderRadius: 999,
                  border: "1px solid #E3E3E3",
                  background: "#FFFFFF",
                  color: "#3C4043",
                  cursor: "pointer",
                }}
              >
                Change
              </button>
            </div>
            <h1
              style={{
                margin: 0,
                fontWeight: 600,
                fontSize: "clamp(28px, 5vw, 34px)",
                letterSpacing: "-0.025em",
              }}
            >
              Your documents
            </h1>
            <p style={{ margin: 0, fontSize: 15, color: "#5F6368" }} data-testid="intake-file-summary">
              {buildSummary(files)}
            </p>
          </div>
          <input
            ref={addFilesRef}
            id={addFilesInputId}
            type="file"
            className="sr-only"
            multiple
            accept={ACCEPTED_UPLOAD_MIME}
            onChange={(event) => {
              const list = event.target.files;
              if (list?.length) {
                void handleAddFiles(Array.from(list));
              }
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="ghost"
            data-testid="intake-add-files"
            disabled={addingFiles}
            onClick={() => addFilesRef.current?.click()}
            style={{
              fontFamily: geist,
              fontSize: 14,
              fontWeight: 500,
              padding: "10px 16px",
              minHeight: 44,
              borderRadius: 999,
              border: "1px solid #E3E3E3",
              background: "#FFFFFF",
              color: "#0D0D0D",
              cursor: addingFiles ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              opacity: addingFiles ? 0.6 : 1,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add files
          </button>
        </div>

        {errorMessage ? (
          <p style={{ margin: 0, fontSize: 14, color: "#1A56C4" }} role="alert">
            {errorMessage}
          </p>
        ) : null}

        <section
          aria-label="Uploaded documents"
          className="ring"
          style={{
            border: "1px solid #E3E3E3",
            borderRadius: 24,
            background: "#FFFFFF",
            boxShadow: "0 1px 2px rgba(0,0,0,.04), 0 8px 28px rgba(0,0,0,.05)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 210px 120px",
              gap: 16,
              padding: "14px 22px",
              borderBottom: "1px solid #F1F3F4",
              fontFamily: ibmMono,
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#5F6368",
            }}
          >
            <span>File</span>
            <span>Hive read it as</span>
            <span style={{ textAlign: "right" }}>Include</span>
          </div>
          <div>
            {files.map((file) => (
              <SourceFileRow
                key={file.sourceDocumentId}
                file={file}
                excluded={file.disposition === "DISCARDED"}
                toggling={toggling === file.sourceDocumentId}
                onToggleInclude={() => void handleToggleInclude(file)}
              />
            ))}
          </div>
          <div
            style={{
              padding: "16px 22px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 14,
              color: "#5F6368",
              background: "#FBFBFB",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#5F6368"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 3v12M7 10l5 5 5-5" />
              <path d="M5 20h14" />
            </svg>
            Drop more files anywhere on this page. Wrong type? Tell Hive and it will re-read the file.
          </div>
        </section>

        {view.thingsThatWouldHelp.length > 0 ? (
          <section data-testid="intake-things-that-would-help" style={{ fontSize: 14, color: "#5F6368" }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#0D0D0D" }}>
              Still helpful to add
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {view.thingsThatWouldHelp.map((item) => (
                <li key={item.packExpectationId}>
                  {item.customerLabel}{" "}
                  <button
                    type="button"
                    data-testid="intake-missing-upload"
                    onClick={() => addFilesRef.current?.click()}
                    style={{
                      fontFamily: geist,
                      fontSize: 13,
                      fontWeight: 500,
                      border: 0,
                      background: "none",
                      color: "#1A56C4",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Upload
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {view.workspaceReady ? (
          <section
            aria-label="Build your hive"
            data-testid="intake-build-study"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 20,
              flexWrap: "wrap",
              padding: 24,
              borderRadius: 24,
              background: "#F8F9FA",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: "30rem" }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                }}
              >
                Ready to build your hive
              </h2>
              <p style={{ margin: 0, fontSize: 14.5, color: "#5F6368" }}>
                Hive reads these {includedCount} documents together, links every finding to its page,
                and tells you what&apos;s missing.
              </p>
            </div>
            <button
              type="button"
              className="go"
              data-testid="intake-build-my-study"
              disabled={studyBuild !== null || includedCount === 0}
              onClick={() => {
                if (studyStartInFlight.current || studyBuild !== null) {
                  return;
                }
                studyStartInFlight.current = true;
                const session = Date.now();
                setStudyBuild({ session, target: "migration" });
                setErrorMessage(null);
                void startIntakeStudy(intakeRunId)
                  .then((outcome) => {
                    if (
                      outcome.run.status === "SUCCEEDED" ||
                      outcome.run.status === "NEEDS_REVIEW"
                    ) {
                      setStudyBuild({
                        session,
                        target: "complete",
                        studyRunId: outcome.run.studyRunId,
                      });
                      return;
                    }
                    const detail = outcome.run.errorMessage?.trim();
                    studyStartInFlight.current = false;
                    setStudyBuild(null);
                    const projectionRetryHint =
                      detail && /case projections/i.test(detail)
                        ? " After fixing that, click Build once more — Hive will reuse your last analysis instead of calling the model again."
                        : "";
                    setErrorMessage(
                      detail
                        ? `We couldn't complete the study. ${detail}${projectionRetryHint}`
                        : "We couldn't complete the study. Please try again in a moment.",
                    );
                  })
                  .catch(() => {
                    studyStartInFlight.current = false;
                    setStudyBuild(null);
                    setErrorMessage("We couldn't start the study. Please try again in a moment.");
                  });
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                border: 0,
                padding: "12px 22px",
                minHeight: 48,
                boxSizing: "border-box",
                borderRadius: 999,
                background: "#0D0D0D",
                color: "#FFFFFF",
                fontWeight: 600,
                fontSize: 15,
                fontFamily: geist,
                cursor: studyBuild || includedCount === 0 ? "not-allowed" : "pointer",
                opacity: studyBuild || includedCount === 0 ? 0.6 : 1,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden>
                <path
                  d="M16 3 27 9.5v13L16 29 5 22.5v-13z"
                  fill="none"
                  stroke="#FBBC05"
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                />
              </svg>
              {studyBuild ? "Hiving…" : "Build my hive"}
            </button>
          </section>
        ) : null}
      </main>
      {studyBuild ? (
        <StudyLifecycleModal
          key={studyBuild.session}
          target={studyBuild.target}
          onOpenHive={() => {
            if (!studyBuild.studyRunId) {
              return;
            }
            router.push(`/study/${encodeURIComponent(studyBuild.studyRunId)}/map`);
          }}
        />
      ) : null}
    </div>
  );
}
