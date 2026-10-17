"use client";

import { CaseExperience } from "@/components/case/CaseExperience";
import { HiveCustomerShell } from "@/components/hive-customer/HiveCustomerShell";

export default function CasePage() {
  return (
    <HiveCustomerShell>
      <div className="mx-auto w-full max-w-[1160px] px-4 py-10 md:px-8 md:py-14">
        <header className="mb-8 flex flex-col gap-2">
          <h1
            className="text-[clamp(1.75rem,4vw,2.25rem)] font-semibold tracking-tight text-customerHive-on-surface"
            style={{ fontFamily: "var(--font-outfit), sans-serif" }}
          >
            My Hives
          </h1>
          <p className="max-w-xl text-base text-customerHive-on-surface-variant">
            Each Hive keeps one situation&apos;s documents together.
          </p>
        </header>
        <CaseExperience />
      </div>
    </HiveCustomerShell>
  );
}
