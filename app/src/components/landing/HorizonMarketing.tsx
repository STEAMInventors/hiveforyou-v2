import Link from "next/link";

export function HorizonMarketing() {
  return (
    <>
      <section className="relative flex min-h-[810px] items-center justify-center bg-hz-surface px-hz-container py-hz-section">
        <div className="relative z-10 mx-auto max-w-5xl text-center">
          <h2 className="font-hz text-[3.875rem] font-normal leading-[1.2] tracking-tight text-hz-on-surface">
            Imagine your case, organized without guesswork
          </h2>
        </div>
      </section>

      <section id="how-it-works" className="relative px-hz-container py-hz-section">
        <div className="mx-auto flex min-h-[596px] max-w-[1118px] flex-col overflow-hidden rounded-[10px] border border-white/60 bg-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.04)] backdrop-blur-2xl md:flex-row">
          <div className="flex flex-1 flex-col justify-center p-hz-card">
            <span className="mb-6 font-hz text-hz-label-caps uppercase tracking-widest text-hz-on-surface-variant">
              01 / 04
            </span>
            <h3 className="mb-6 font-hz text-[2rem] leading-tight text-hz-on-surface">
              Tell us what you are working on
            </h3>
            <p className="mb-10 max-w-md font-hz text-hz-body-lg text-hz-on-surface-variant">
              Describe your situation, choose a domain when it fits, and upload the documents you
              already have. Hive starts from your intent—not a generic template.
            </p>
            <Link
              href="#start"
              className="inline-flex w-fit items-center justify-center gap-2 rounded-[8px] border border-white/60 bg-white/40 px-8 py-4 font-hz text-base font-medium text-hz-on-surface shadow-sm backdrop-blur-md transition-colors hover:bg-white/60"
            >
              Start with your documents
            </Link>
          </div>
          <div className="relative flex flex-1 items-center justify-end overflow-hidden border-l border-white/40 bg-white/20">
            <div className="absolute right-[-10%] flex h-[80%] w-[120%] translate-y-[5%] flex-col rounded-l-[10px] border border-white/60 bg-white/40 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between border-b border-white/40 pb-4">
                <span className="font-hz text-hz-headline-md text-hz-on-surface">Your workspace</span>
                <div className="flex gap-2">
                  <div className="h-3 w-3 rounded-full bg-black/10" />
                  <div className="h-3 w-3 rounded-full bg-black/10" />
                  <div className="h-3 w-3 rounded-full bg-black/10" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-[8px] border border-white/60 bg-white/50 p-4 shadow-sm">
                  <div className="mb-4 h-2 w-16 rounded bg-black/10" />
                  <div className="mb-2 h-16 rounded bg-white/60" />
                  <div className="h-16 rounded bg-white/60" />
                </div>
                <div className="rounded-[8px] border border-white/60 bg-white/50 p-4 shadow-sm">
                  <div className="mb-4 h-2 w-16 rounded bg-black/10" />
                  <div className="mb-2 h-16 rounded bg-white/60" />
                </div>
                <div className="rounded-[8px] border border-white/60 bg-white/50 p-4 shadow-sm">
                  <div className="mb-4 h-2 w-16 rounded bg-black/10" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative px-hz-container py-hz-section">
        <div className="mx-auto flex min-h-[596px] max-w-[1118px] flex-col overflow-hidden rounded-[10px] border border-white/60 bg-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.04)] backdrop-blur-2xl md:flex-row">
          <div className="flex flex-1 flex-col justify-center p-hz-card">
            <span className="mb-6 font-hz text-hz-label-caps uppercase tracking-widest text-hz-on-surface-variant">
              02 / 04
            </span>
            <h3 className="mb-6 font-hz text-[2rem] leading-tight text-hz-on-surface">
              Reading that respects the source
            </h3>
            <p className="mb-10 max-w-md font-hz text-hz-body-lg text-hz-on-surface-variant">
              Hive extracts, classifies, and links evidence to claims. Nothing is presented as fact
              until it is validated against what your documents actually say.
            </p>
          </div>
          <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-hz-primary/80 to-[#FF2A6D]/80 backdrop-blur-md">
            <div className="relative w-[80%] rounded-[10px] border border-white/60 bg-white/50 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl">
              <div className="mb-6 flex items-center gap-2 border-b border-white/40 pb-4">
                <span className="material-symbols-outlined text-hz-primary">terminal</span>
                <span className="font-hz text-lg text-hz-on-surface">Intake progress</span>
              </div>
              <div className="space-y-4 font-hz text-base">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined mt-0.5 text-[20px] text-hz-secondary">
                    check_circle
                  </span>
                  <span className="text-hz-on-surface-variant">Documents committed securely</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined mt-0.5 text-[20px] text-hz-secondary">
                    check_circle
                  </span>
                  <span className="text-hz-on-surface-variant">Text and structure extracted</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined mt-0.5 text-[20px] text-hz-secondary">
                    check_circle
                  </span>
                  <span className="text-hz-on-surface-variant">Evidence linked to claims</span>
                </div>
                <div className="flex items-start gap-3 opacity-50">
                  <span className="material-symbols-outlined mt-0.5 animate-pulse text-[20px] text-hz-outline">
                    sync
                  </span>
                  <span className="text-hz-on-surface-variant">Building your case map…</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="showcase" className="relative overflow-hidden bg-hz-surface py-hz-section">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: "radial-gradient(#C084FC 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative z-10 mx-auto mb-16 flex max-w-7xl flex-col items-center justify-center px-hz-container">
          <div className="flex items-center gap-4 rounded-full border border-white/60 bg-white/40 px-6 py-3 shadow-sm backdrop-blur-xl">
            <span className="font-hz text-hz-body-lg text-hz-on-surface">Documents</span>
            <span className="material-symbols-outlined text-hz-primary">arrow_forward</span>
            <span className="font-hz text-hz-body-lg font-medium text-hz-on-surface">Case map</span>
          </div>
        </div>
        <div className="relative z-10 flex justify-center gap-6 overflow-x-auto px-8 pb-12 snap-x snap-mandatory hz-hide-scrollbar">
          {[
            { tint: "bg-[#38BDF8]/10", inner: "grid grid-cols-2 gap-2" },
            { tint: "bg-[#C084FC]/10", inner: "flex flex-col gap-4 py-4" },
            { tint: "bg-[#FF9A9E]/10", inner: "" },
            { tint: "bg-[#FFD166]/10", inner: "grid grid-cols-2 gap-4" },
          ].map((card, index) => (
            <div
              key={index}
              className="group flex h-[333px] w-[400px] shrink-0 snap-center flex-col overflow-hidden rounded-[10px] border border-white/60 bg-white/40 shadow-sm backdrop-blur-xl"
            >
              <div className={`relative h-full overflow-hidden p-6 ${card.tint}`}>
                <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent" />
                <div className="relative z-10 h-full rounded-[8px] border border-white/80 bg-white/60 p-4 shadow-[0_4px_16px_rgba(0,0,0,0.02)] backdrop-blur-md">
                  <div className="mb-4 h-4 w-24 rounded bg-white/80" />
                  <div className={card.inner || "h-40 rounded-lg border border-white/60 bg-white/50"}>
                    {card.inner === "grid grid-cols-2 gap-2" ? (
                      <>
                        <div className="h-32 rounded border border-white/50 bg-[#38BDF8]/20" />
                        <div className="h-32 rounded border border-white/50 bg-[#C084FC]/20" />
                      </>
                    ) : null}
                    {card.inner === "flex flex-col gap-4 py-4" ? (
                      <>
                        <div className="h-4 w-full rounded bg-white/80" />
                        <div className="h-4 w-5/6 rounded bg-white/80" />
                        <div className="h-4 w-full rounded bg-white/80" />
                      </>
                    ) : null}
                    {card.inner === "grid grid-cols-2 gap-4" ? (
                      <>
                        <div className="aspect-square rounded bg-white/80" />
                        <div className="aspect-square rounded bg-white/80" />
                        <div className="aspect-square rounded bg-white/80" />
                        <div className="aspect-square rounded bg-white/80" />
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="bg-hz-surface px-hz-container py-hz-section">
        <div className="mx-auto flex max-w-[1515px] flex-col gap-16 lg:flex-row">
          <div className="lg:w-1/3">
            <h2 className="sticky top-32 font-hz text-[3.75rem] leading-[1.1] text-hz-on-surface">
              Frequently asked questions
            </h2>
          </div>
          <div className="flex flex-col lg:w-2/3">
            {[
              "What is HiveForYou?",
              "How does document intake work?",
              "Can I see where each claim comes from?",
              "Who can access my documents?",
            ].map((question) => (
              <div
                key={question}
                className="group flex cursor-pointer items-center border-b border-hz-outline-variant/30 py-4"
              >
                <div className="flex w-full items-center justify-between">
                  <h3 className="font-hz text-xl text-hz-on-surface transition-colors group-hover:text-hz-primary">
                    {question}
                  </h3>
                  <span className="material-symbols-outlined text-hz-on-surface-variant transition-colors group-hover:text-hz-primary">
                    add
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative flex min-h-[70vh] cursor-reactive-container flex-col items-center justify-center overflow-hidden px-hz-container py-hz-section">
        <div className="hz-cta-dynamic-gradient cursor-reactive absolute inset-0 -z-10" />
        <h2 className="relative z-10 mb-10 max-w-2xl text-center font-hz text-[3.375rem] leading-tight text-white drop-shadow-sm">
          Ready to understand what you have?
        </h2>
        <Link
          href="#start"
          className="group relative z-10 inline-flex items-center gap-3 rounded-full border border-white/60 bg-white/30 px-10 py-5 font-hz text-hz-body-lg font-medium text-white shadow-sm backdrop-blur-md transition-all hover:scale-105 hover:bg-white/40"
        >
          Get started
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/60">
            <span className="material-symbols-outlined text-sm text-hz-on-surface transition-transform group-hover:translate-x-0.5">
              arrow_forward
            </span>
          </div>
        </Link>
      </section>
    </>
  );
}
