"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { commitStagedDocuments } from "@/lib/documents/commit-client";
import { useStagedDocuments } from "@/lib/intake/staged-documents-context";

/** Legacy route; prefer in-place discovery via `onDiscoveryStarted`. */
export const UNDERSTAND_DOCUMENTS_PATH = "/processing" as const;

type UnderstandDocumentsCtaProps = {
  /** When set, discovery runs on the current page instead of navigating away. */
  onDiscoveryStarted?: () => void;
  /** Fired after staged documents are persisted and ids are ready for discover. */
  onDocumentsPersisted?: () => void;
  onDocumentsPersistFailed?: (message: string) => void;
  hidden?: boolean;
};

export function UnderstandDocumentsCta({
  onDiscoveryStarted,
  onDocumentsPersisted,
  onDocumentsPersistFailed,
  hidden = false,
}: UnderstandDocumentsCtaProps) {
  const router = useRouter();
  const { documents, adoptPersistedDocuments } = useStagedDocuments();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hidden) {
    return null;
  }

  return (
    <div className="flex w-full flex-col items-center gap-3 text-center">
      <div className="flex w-full flex-col items-center justify-center gap-4 sm:w-auto sm:flex-row">
        <button
          type="button"
          data-testid="understand-documents-cta"
          disabled={pending || documents.length === 0}
          onClick={() => {
            if (pending || documents.length === 0) {
              return;
            }
            setPending(true);
            setError(null);
            onDiscoveryStarted?.();
            void commitStagedDocuments(documents)
              .then((result) => {
                adoptPersistedDocuments(result);
                onDocumentsPersisted?.();
                if (!onDiscoveryStarted) {
                  router.push(UNDERSTAND_DOCUMENTS_PATH);
                }
              })
              .catch(() => {
                const message = "Hive couldn't save your documents.";
                setError(message);
                onDocumentsPersistFailed?.(message);
              })
              .finally(() => {
                setPending(false);
              });
          }}
          className="flex w-full items-center justify-center gap-3 rounded-hive-xl bg-hive-sage px-8 py-3.5 font-sans text-base font-bold text-hive-text-inverse shadow-hive-lg transition-all hover:-translate-y-0.5 hover:bg-hive-sage-muted hover:shadow-hive-lg sm:w-auto md:text-lg disabled:cursor-wait disabled:opacity-80"
        >
          <span>Understand my documents</span>
          <ArrowRight className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
      </div>
      {error ? (
        <p className="font-sans text-sm text-hive-text-muted" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
