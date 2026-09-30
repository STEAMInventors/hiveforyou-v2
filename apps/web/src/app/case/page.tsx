"use client";

import { HiveFooter } from "@/components/HiveFooter";
import { HiveHeader } from "@/components/HiveHeader";
import { CaseExperience } from "@/components/case/CaseExperience";

export default function CasePage() {
  return (
    <>
      <HiveHeader />
      <main className="mx-auto min-h-0 w-full max-w-hive flex-1 px-6 py-8 sm:py-10">
        <CaseExperience />
      </main>
      <HiveFooter />
    </>
  );
}
