"use client";

import { useMemo, useState } from "react";

import { DocumentCollectionSummary } from "@/components/DocumentCollectionSummary";
import { DocumentDropzone } from "@/components/DocumentDropzone";
import {
  DocumentVisualAmbientLeft,
  DocumentVisualAmbientRight,
} from "@/components/DocumentVisual";
import { DocumentDiscoveryExperience } from "@/components/document-structure/DocumentDiscoveryExperience";
import { StagedDocumentsCompactList } from "@/components/document-structure/StagedDocumentsCompactList";
import { DocumentsAddedHero } from "@/components/DocumentsAddedHero";
import { TrustMessage } from "@/components/TrustMessage";
import { UnderstandDocumentsCta } from "@/components/UnderstandDocumentsCta";
import { UploadHero } from "@/components/UploadHero";
import { useStagedDocuments } from "@/lib/intake/staged-documents-context";
import { totalStagedBytes } from "@/lib/staged-documents";

export function UploadExperience() {
  const { documents, addDocuments, removeDocument } = useStagedDocuments();
  const [discoveryStarted, setDiscoveryStarted] = useState(false);
  const [discoverySettled, setDiscoverySettled] = useState(false);
  const [documentsPersisted, setDocumentsPersisted] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  const totalBytes = useMemo(() => totalStagedBytes(documents), [documents]);

  const hasDocuments = documents.length > 0;

  if (!hasDocuments) {
    return (
      <>
        <UploadHero />
        <div className="group relative w-full">
          <DocumentVisualAmbientLeft />
          <DocumentVisualAmbientRight />
          <DocumentDropzone onFilesSelected={addDocuments} />
        </div>
        <TrustMessage />
      </>
    );
  }

  const showStagingChrome = !discoveryStarted || !discoverySettled;

  return (
    <div
      className={[
        "relative flex w-full flex-col items-center",
        discoverySettled ? "max-w-6xl" : "max-w-4xl",
      ].join(" ")}
    >
      <div
        className="pointer-events-none absolute -top-12 left-1/2 -z-10 h-40 w-80 -translate-x-1/2 rounded-full bg-hive-soft-sky/40 blur-3xl"
        aria-hidden
      />

      {showStagingChrome && !discoveryStarted ? (
        <DocumentsAddedHero compact />
      ) : null}

      {discoveryStarted && !discoverySettled ? (
        <header className="mb-4 w-full text-center sm:mb-5">
          <p className="font-mono text-xs font-medium text-hive-blue">Organizing your collection</p>
        </header>
      ) : null}

      {!discoveryStarted ? (
        <>
          <DocumentCollectionSummary count={documents.length} totalBytes={totalBytes} />
          <div className="mb-5 w-full">
            <StagedDocumentsCompactList
              documents={documents}
              onRemove={removeDocument}
              onFilesAdded={addDocuments}
            />
          </div>
        </>
      ) : (
        <div className={discoverySettled ? "w-full" : "mb-4 w-full"}>
          <DocumentDiscoveryExperience
            stagedDocuments={documents}
            embedded
            processingModalOpen
            discoveryActive={documentsPersisted}
            persistError={persistError}
            onRemoveStagedDocument={removeDocument}
            onAddStagedDocuments={addDocuments}
            onSettled={() => setDiscoverySettled(true)}
          />
        </div>
      )}

      <UnderstandDocumentsCta
        hidden={discoveryStarted}
        onDiscoveryStarted={() => {
          setPersistError(null);
          setDiscoveryStarted(true);
        }}
        onDocumentsPersisted={() => setDocumentsPersisted(true)}
        onDocumentsPersistFailed={(message) => setPersistError(message)}
      />

      {!discoveryStarted ? <TrustMessage /> : null}

      <p className="sr-only" role="status" aria-live="polite">
        {documents.length} document{documents.length === 1 ? "" : "s"} in your collection.
      </p>
    </div>
  );
}
