"use client";

import { useEffect, useState } from "react";

import { DocumentDiscoveryExperience } from "@/components/document-structure/DocumentDiscoveryExperience";
import { useStagedDocuments } from "@/lib/intake/staged-documents-context";
import { useRouter } from "next/navigation";

export default function ProcessingPage() {
  const router = useRouter();
  const { documents } = useStagedDocuments();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready && documents.length === 0) {
      router.replace("/");
    }
  }, [ready, documents.length, router]);

  if (!ready || documents.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="font-sans text-sm text-hive-text-muted" role="status">
          Loading your collection…
        </p>
      </div>
    );
  }

  return <DocumentDiscoveryExperience stagedDocuments={documents} />;
}
