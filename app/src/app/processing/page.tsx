"use client";

import { useEffect, useState } from "react";

import { DocumentDiscoveryExperience } from "@/components/document-structure/DocumentDiscoveryExperience";
import { HiveTransitionModal } from "@/components/hive/HiveTransitionModal";
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
    return <HiveTransitionModal phase="discover" />;
  }

  return <DocumentDiscoveryExperience stagedDocuments={documents} />;
}
