import { UploadExperience } from "@/components/UploadExperience";

import { HorizonCursorEffect } from "./HorizonCursorEffect";
import { HorizonFooter } from "./HorizonFooter";
import { HorizonMarketing } from "./HorizonMarketing";
import { HorizonNav } from "./HorizonNav";

export function HorizonLanding() {
  return (
    <div className="font-hz bg-hz-background text-hz-on-background selection:bg-hz-primary-container selection:text-hz-on-primary-container">
      <HorizonCursorEffect />
      <HorizonNav />
      <main className="mx-auto w-full max-w-[1728px]">
        <section
          id="start"
          className="cursor-reactive-container relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-hz-container pb-hz-section pt-48 text-center"
        >
          <div className="hz-hero-dynamic-gradient cursor-reactive absolute inset-0 -z-10" />
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/40 px-4 py-2 shadow-sm backdrop-blur-xl">
            <span className="rounded-full bg-hz-secondary-container px-2 py-1 font-hz text-hz-label-caps uppercase text-hz-on-secondary-container">
              Intake
            </span>
            <span className="font-hz text-base text-hz-on-surface">
              Upload documents · describe your purpose
            </span>
          </div>
          <h1 className="mb-6 max-w-4xl font-hz text-hz-display tracking-tighter text-hz-on-surface">
            What are you working on?
          </h1>
          <p className="mb-12 max-w-2xl font-hz text-hz-body-lg text-hz-on-surface-variant">
            HiveForYou reads what you upload, links evidence to claims, and builds a living picture
            of your case—without inventing facts.
          </p>
          <UploadExperience />
        </section>
        <HorizonMarketing />
      </main>
      <HorizonFooter />
    </div>
  );
}
