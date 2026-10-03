import Link from "next/link";

import { HiveAppLogo } from "@/components/HiveWordmark";

export function HorizonNav() {
  return (
    <nav className="fixed top-6 left-1/2 z-50 flex w-[95%] max-w-7xl -translate-x-1/2 items-center justify-between rounded-full border border-white/60 bg-white/40 px-8 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.05)] backdrop-blur-xl">
      <HiveAppLogo
        linkHome
        className="rounded-lg transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hz-primary/40"
      />

      <div className="hidden items-center gap-6 md:flex">
        <Link
          href="#how-it-works"
          className="font-hz text-base font-bold text-hz-primary transition-transform active:scale-90"
        >
          How it works
        </Link>
        <Link
          href="#showcase"
          className="font-hz text-base font-medium text-hz-on-surface-variant transition-colors duration-300 hover:text-hz-primary active:scale-90"
        >
          Your case map
        </Link>
        <Link
          href="#faq"
          className="font-hz text-base font-medium text-hz-on-surface-variant transition-colors duration-300 hover:text-hz-primary active:scale-90"
        >
          FAQ
        </Link>
        <Link
          href="#help"
          className="font-hz text-base font-medium text-hz-on-surface-variant transition-colors duration-300 hover:text-hz-primary active:scale-90"
        >
          Help
        </Link>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="flex items-center justify-center text-hz-on-surface-variant transition-colors duration-300 hover:text-hz-primary active:scale-90"
          aria-label="Language"
        >
          <span className="material-symbols-outlined">language</span>
        </button>
        <a
          href="#start"
          className="rounded-full border border-white/60 bg-white/40 px-6 py-2 font-hz text-base font-medium text-hz-on-surface shadow-sm backdrop-blur-md transition-colors duration-300 hover:bg-white/60 active:scale-90"
        >
          Get started
        </a>
      </div>
    </nav>
  );
}
