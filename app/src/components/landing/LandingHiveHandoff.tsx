"use client";

import { useState } from "react";

import { CreateYourHiveModal } from "@/components/landing/CreateYourHiveModal";
import { validateCreateHiveInput } from "@/components/landing/create-hive-validation";
import { rememberClientCaseId } from "@/lib/canonical-study/map-start-request";
import type { HiveSelectionIntent } from "@hiveforyou/shared/cases";

export type HiveHandoffSelection = {
  caseId: string;
  selectionIntent: HiveSelectionIntent;
  hiveName: string;
  hiveDescription: string | null;
};

export type HiveHandoffDraft = {
  caseId: string;
  hiveName: string;
  hiveDescription: string;
};

type LandingHiveHandoffProps = {
  fileCount: number;
  composerSelectedDomainId: string | null;
  selectedDomainLabel: string | null;
  draftCaseId: string;
  initialDraft?: HiveHandoffDraft | null;
  onBack: () => void;
  onContinue: (selection: HiveHandoffSelection) => void;
  continueBusy?: boolean;
};

export function LandingHiveHandoff({
  fileCount,
  composerSelectedDomainId,
  selectedDomainLabel,
  draftCaseId,
  initialDraft = null,
  onBack,
  onContinue,
  continueBusy = false,
}: LandingHiveHandoffProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [hiveName, setHiveName] = useState(initialDraft?.hiveName ?? "");
  const [hiveDescription, setHiveDescription] = useState(initialDraft?.hiveDescription ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  const openModal = () => {
    setNameError(null);
    setDescriptionError(null);
    setModalOpen(true);
  };

  const handleCreateHive = () => {
    const validation = validateCreateHiveInput({ hiveName, hiveDescription });
    if (!validation.ok) {
      setNameError(validation.hiveNameError ?? null);
      setDescriptionError(validation.hiveDescriptionError ?? null);
      return;
    }

    rememberClientCaseId(draftCaseId);
    setModalOpen(false);
    onContinue({
      caseId: draftCaseId,
      selectionIntent: "new",
      hiveName: validation.hiveName,
      hiveDescription: validation.hiveDescription,
    });
  };

  return (
    <>
      <section
        className="mx-auto flex w-full max-w-[560px] flex-col gap-5"
        data-testid="landing-hive-handoff"
        aria-label="Create your Hive"
      >
        <div className="flex flex-col gap-2 text-center">
          <h2 className="m-0 text-[1.5rem] font-semibold tracking-tight text-[#0D0D0D]">
            Create your Hive
          </h2>
          <p className="m-0 text-sm leading-relaxed text-[#5F6368]">
            Attach your {fileCount} selected document{fileCount === 1 ? "" : "s"} to a new Hive.
            Reading starts when you continue.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            data-testid="landing-hive-handoff-create"
            disabled={continueBusy}
            className="min-h-12 w-full max-w-sm rounded-[12px] border-0 bg-[#2F6FE4] px-6 text-[15px] font-semibold text-white hover:bg-[#2456B8] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            onClick={openModal}
          >
            Create Your Hive
          </button>
          {composerSelectedDomainId ? (
            <p className="m-0 text-center text-sm text-[#5F6368]" data-testid="landing-hive-handoff-domain">
              Domain:{" "}
              <span className="font-medium text-[#3C4043]">
                {selectedDomainLabel ?? composerSelectedDomainId}
              </span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <button
            type="button"
            data-testid="landing-hive-handoff-back"
            className="min-h-11 rounded-full border border-[#E3E3E3] bg-white px-5 text-sm font-medium text-[#3C4043]"
            onClick={onBack}
            disabled={continueBusy}
          >
            Back
          </button>
        </div>
      </section>

      <CreateYourHiveModal
        open={modalOpen}
        domainId={composerSelectedDomainId}
        domainLabel={selectedDomainLabel}
        hiveName={hiveName}
        hiveDescription={hiveDescription}
        nameError={nameError}
        descriptionError={descriptionError}
        submitBusy={continueBusy}
        onHiveNameChange={(value) => {
          setHiveName(value);
          if (nameError) {
            setNameError(null);
          }
        }}
        onHiveDescriptionChange={(value) => {
          setHiveDescription(value);
          if (descriptionError) {
            setDescriptionError(null);
          }
        }}
        onCancel={() => {
          setModalOpen(false);
        }}
        onSubmit={handleCreateHive}
      />
    </>
  );
}
