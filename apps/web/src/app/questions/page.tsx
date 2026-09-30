"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="font-sans text-sm text-hive-text-muted" role="status">
          Loading your collection…
        </p>
      </div>
    );
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
