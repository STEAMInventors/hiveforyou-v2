"use client";



import { useEffect, useState } from "react";



import { HiveHomeComposer } from "@/components/intake/HiveHomeComposer";

import { IntakeUnderstanding } from "@/components/intake/IntakeUnderstanding";

import { TrustMessage } from "@/components/TrustMessage";

import {

  clearStoredIntakeRun,

  fetchIntakeRun,

  readStoredIntakeRunId,

  resetIntakeHomeSession,

} from "@/lib/intake/intake-client";

import { useStagedDocuments } from "@/lib/intake/staged-documents-context";



export type ComposerPurpose = {

  rawIntent: string;

  explicitDomainId: string | null;

};



export function UploadExperience({ showTrustMessage = true }: { showTrustMessage?: boolean }) {

  const { addDocuments, clearDocuments } = useStagedDocuments();

  const [started, setStarted] = useState(false);

  const [resumeRunId, setResumeRunId] = useState<string | null>(null);

  const [composerPurpose, setComposerPurpose] = useState<ComposerPurpose | null>(null);



  const processing = started || Boolean(resumeRunId);



  useEffect(() => {

    let cancelled = false;



    async function restoreInFlightRun() {

      const existing = readStoredIntakeRunId();

      if (!existing) {

        return;

      }

      try {

        const view = await fetchIntakeRun(existing);

        if (cancelled) {

          return;

        }

        if (view.status === "RUNNING") {

          setResumeRunId(existing);

          return;

        }

        clearStoredIntakeRun();

      } catch {

        if (!cancelled) {

          clearStoredIntakeRun();

        }

      }

    }



    void restoreInFlightRun();

    return () => {

      cancelled = true;

    };

  }, []);



  return (

    <>

      <div

        className={

          processing ? "pointer-events-none select-none opacity-[0.42]" : undefined

        }

        aria-hidden={processing ? true : undefined}

      >

        <HiveHomeComposer

          busy={processing}

          onSubmit={({ rawIntent, explicitDomainId, files }) => {

            resetIntakeHomeSession();

            setResumeRunId(null);

            clearDocuments();

            addDocuments(files);

            setComposerPurpose({ rawIntent, explicitDomainId });

            setStarted(true);

          }}

        />

        {showTrustMessage ? <TrustMessage /> : null}

      </div>

      {processing ? (

        <IntakeUnderstanding
          resumeRunId={started ? null : resumeRunId}
          composerPurpose={started ? composerPurpose : null}
          onDismiss={() => {
            clearStoredIntakeRun();
            setStarted(false);
            setResumeRunId(null);
            setComposerPurpose(null);
          }}
        />

      ) : null}

    </>

  );

}


