"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { HiveTransitionModal } from "@/components/hive/HiveTransitionModal";
import { HiveFooter } from "@/components/HiveFooter";
import { HiveHeader } from "@/components/HiveHeader";
import { QuestionsExperience } from "@/components/questions/QuestionsExperience";
import { useStagedDocuments } from "@/lib/intake/staged-documents-context";

export default function QuestionsPage() {
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

  return (
    <>
      <HiveHeader />
      <main className="flex-1 bg-hive-page py-6 sm:py-8">
        <QuestionsExperience />
      </main>
      <HiveFooter />
    </>
  );
}
