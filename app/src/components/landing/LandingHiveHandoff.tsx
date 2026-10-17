"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchOwnedHive, fetchOwnedHives, OwnedHivesFetchError } from "@/lib/cases/cases-client";
import { rememberClientCaseId } from "@/lib/canonical-study/map-start-request";
import {
  hiveDomainConflictsWithComposer,
  type HiveSelectionIntent,
  type OwnedHiveSummary,
} from "@hiveforyou/shared/cases";

export type HiveHandoffSelection = {
  caseId: string;
  selectionIntent: HiveSelectionIntent;
};

type LandingHiveHandoffProps = {
  fileCount: number;
  composerExplicitDomainId: string | null;
  onBack: () => void;
  onContinue: (selection: HiveHandoffSelection) => void;
  continueBusy?: boolean;
};

function shortHiveLabel(caseId: string): string {
  return caseId.slice(0, 8);
}

function formatHiveDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
}

export function LandingHiveHandoff({
  fileCount,
  composerExplicitDomainId,
  onBack,
  onContinue,
  continueBusy = false,
}: LandingHiveHandoffProps) {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ownedHives, setOwnedHives] = useState<OwnedHiveSummary[]>([]);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [newCaseId, setNewCaseId] = useState<string>(() => crypto.randomUUID());
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadState("loading");
      setLoadError(null);
      try {
        const payload = await fetchOwnedHives();
        if (cancelled) {
          return;
        }
        setOwnedHives(payload.cases);
        setLoadState("ready");
      } catch (error) {
        if (cancelled) {
          return;
        }
        const code = error instanceof OwnedHivesFetchError ? error.code : "UNEXPECTED";
        setLoadError(
          code === "UNAUTHENTICATED"
            ? "Sign in is required to choose a Hive."
            : "We couldn't load your Hives. Try again.",
        );
        setLoadState("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectableHives = useMemo(
    () =>
      ownedHives.filter(
        (hive) =>
          !hiveDomainConflictsWithComposer({
            establishedDomainId: hive.domainId,
            composerExplicitDomainId,
          }),
      ),
    [ownedHives, composerExplicitDomainId],
  );

  const blockedHives = useMemo(
    () =>
      ownedHives.filter((hive) =>
        hiveDomainConflictsWithComposer({
          establishedDomainId: hive.domainId,
          composerExplicitDomainId,
        }),
      ),
    [ownedHives, composerExplicitDomainId],
  );

  const handleContinue = async () => {
    setConfirmError(null);
    if (mode === "new") {
      rememberClientCaseId(newCaseId);
      onContinue({ caseId: newCaseId, selectionIntent: "new" });
      return;
    }

    if (!selectedCaseId) {
      setConfirmError("Choose one of your Hives to continue.");
      return;
    }

    setConfirmBusy(true);
    try {
      const owned = await fetchOwnedHive(selectedCaseId);
      if (
        hiveDomainConflictsWithComposer({
          establishedDomainId: owned.domainId,
          composerExplicitDomainId,
        })
      ) {
        setConfirmError("This Hive's domain doesn't match what you're working on.");
        return;
      }
      rememberClientCaseId(owned.caseId);
      onContinue({ caseId: owned.caseId, selectionIntent: "existing" });
    } catch (error) {
      const code = error instanceof OwnedHivesFetchError ? error.code : "UNEXPECTED";
      setConfirmError(
        code === "CASE_NOT_FOUND"
          ? "That Hive isn't available on your account."
          : "We couldn't confirm this Hive. Try again or create a new one.",
      );
    } finally {
      setConfirmBusy(false);
    }
  };

  const busy = continueBusy || confirmBusy;

  return (
    <section
      className="mx-auto flex w-full max-w-[560px] flex-col gap-5"
      data-testid="landing-hive-handoff"
      aria-label="Create or choose a Hive"
    >
      <div className="flex flex-col gap-2 text-center">
        <h2 className="m-0 text-[1.5rem] font-semibold tracking-tight text-[#0D0D0D]">
          Create or choose your Hive
        </h2>
        <p className="m-0 text-sm leading-relaxed text-[#5F6368]">
          Attach your {fileCount} selected document{fileCount === 1 ? "" : "s"} to a Hive. Reading
          starts only after you continue.
        </p>
      </div>

      {loadState === "loading" ? (
        <p
          className="m-0 text-center text-sm text-[#5F6368]"
          role="status"
          data-testid="landing-hive-handoff-loading"
        >
          Loading your Hives…
        </p>
      ) : null}

      {loadState === "error" ? (
        <div
          className="rounded-[16px] border border-[#FAD2CF] bg-[#FCECEA] px-5 py-4 text-sm text-[#B3261E]"
          data-testid="landing-hive-handoff-error"
          role="alert"
        >
          {loadError}
        </div>
      ) : null}

      {loadState === "ready" ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              data-testid="landing-hive-handoff-mode-new"
              className={
                mode === "new"
                  ? "min-h-11 rounded-[14px] border-2 border-[#0D0D0D] bg-[#F8F9FA] px-4 text-left text-sm font-medium text-[#0D0D0D]"
                  : "min-h-11 rounded-[14px] border border-[#DADCE0] bg-white px-4 text-left text-sm font-medium text-[#3C4043]"
              }
              onClick={() => {
                setMode("new");
                setConfirmError(null);
                setNewCaseId(crypto.randomUUID());
              }}
            >
              Create new Hive
            </button>
            <button
              type="button"
              data-testid="landing-hive-handoff-mode-existing"
              disabled={ownedHives.length === 0}
              className={
                mode === "existing"
                  ? "min-h-11 rounded-[14px] border-2 border-[#0D0D0D] bg-[#F8F9FA] px-4 text-left text-sm font-medium text-[#0D0D0D] disabled:opacity-50"
                  : "min-h-11 rounded-[14px] border border-[#DADCE0] bg-white px-4 text-left text-sm font-medium text-[#3C4043] disabled:cursor-not-allowed disabled:opacity-50"
              }
              onClick={() => {
                setMode("existing");
                setConfirmError(null);
              }}
            >
              Choose existing Hive
            </button>
          </div>

          {mode === "new" ? (
            <p className="m-0 text-sm text-[#5F6368]" data-testid="landing-hive-handoff-new-copy">
              A new Hive will be created when your documents are saved. Id{" "}
              <span className="font-mono text-xs text-[#3C4043]">{shortHiveLabel(newCaseId)}…</span>
            </p>
          ) : null}

          {mode === "existing" && ownedHives.length === 0 ? (
            <p className="m-0 text-sm text-[#5F6368]" data-testid="landing-hive-handoff-empty">
              You don&apos;t have any Hives yet. Create a new one to continue.
            </p>
          ) : null}

          {mode === "existing" && selectableHives.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="landing-hive-handoff-list">
              {selectableHives.map((hive) => {
                const selected = selectedCaseId === hive.caseId;
                return (
                  <li key={hive.caseId}>
                    <button
                      type="button"
                      data-testid={`landing-hive-handoff-option-${hive.caseId}`}
                      className={
                        selected
                          ? "flex w-full flex-col gap-0.5 rounded-[14px] border-2 border-[#0D0D0D] bg-[#F8F9FA] px-4 py-3 text-left"
                          : "flex w-full flex-col gap-0.5 rounded-[14px] border border-[#DADCE0] bg-white px-4 py-3 text-left"
                      }
                      onClick={() => {
                        setSelectedCaseId(hive.caseId);
                        setConfirmError(null);
                      }}
                    >
                      <span className="text-sm font-medium text-[#0D0D0D]">
                        Hive {shortHiveLabel(hive.caseId)}
                      </span>
                      <span className="text-xs text-[#5F6368]">
                        Updated {formatHiveDate(hive.updatedAt)}
                        {hive.domainId ? ` · ${hive.domainId}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {loadState === "ready" && blockedHives.length > 0 ? (
        <div
          className="rounded-[14px] border border-dashed border-[#DADCE0] bg-[#F8F9FA] px-4 py-3 text-sm text-[#5F6368]"
          data-testid="landing-hive-handoff-domain-blocked"
        >
          {blockedHives.length === 1 ? "One Hive" : `${blockedHives.length} Hives`} use a different
          domain and can&apos;t be selected for this upload.
        </div>
      ) : null}

      {confirmError ? (
        <p
          className="m-0 text-sm text-[#B3261E]"
          role="alert"
          data-testid="landing-hive-handoff-confirm-error"
        >
          {confirmError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
        <button
          type="button"
          data-testid="landing-hive-handoff-back"
          className="min-h-11 rounded-full border border-[#E3E3E3] bg-white px-5 text-sm font-medium text-[#3C4043]"
          onClick={onBack}
          disabled={busy}
        >
          Back
        </button>
        <button
          type="button"
          data-testid="landing-hive-handoff-continue"
          disabled={busy || loadState !== "ready"}
          className="min-h-11 rounded-full border-0 bg-[#0D0D0D] px-6 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-70"
          onClick={() => {
            void handleContinue();
          }}
        >
          {busy ? "Starting…" : "Continue to upload"}
        </button>
      </div>
    </section>
  );
}
