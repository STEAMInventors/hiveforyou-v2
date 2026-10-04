import Link from "next/link";

import { HiveWordmark } from "@/components/HiveWordmark";

export function HiveFooter() {
  return (
    <footer className="mt-auto w-full border-t border-hive-border bg-hive-surface/50 px-6 py-5">
      <div className="mx-auto flex max-w-hive flex-col items-center justify-between gap-3 font-sans text-xs text-hive-text-muted sm:flex-row">
        <div className="flex items-center gap-2">
          <HiveWordmark size="footer" />
          <span aria-hidden>&middot;</span>
          <span>Independent document intelligence</span>
        </div>
        <nav
          className="flex items-center gap-5"
          aria-label="Legal and support"
        >
          <Link
            href="#privacy"
            className="transition-colors hover:text-hive-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hive-blue-muted"
          >
            Privacy
          </Link>
          <Link
            href="#terms"
            className="transition-colors hover:text-hive-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hive-blue-muted"
          >
            Terms
          </Link>
          <Link
            href="#contact"
            className="transition-colors hover:text-hive-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hive-blue-muted"
          >
            Contact Support
          </Link>
        </nav>
      </div>
    </footer>
  );
}
