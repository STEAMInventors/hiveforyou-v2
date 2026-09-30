import { CircleHelp } from "lucide-react";
import Link from "next/link";

import { HiveBrandMark, HiveWordmark } from "@/components/HiveWordmark";

export function HiveHeader() {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-hive-border bg-hive-surface/80 backdrop-blur-md">
      <div className="mx-auto flex h-18 max-w-hive items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hive-blue-muted"
        >
          <HiveBrandMark />
          <HiveWordmark size="header" />
        </Link>

        <nav
          className="flex items-center gap-6"
          aria-label="Account and help"
        >
          <Link
            href="#help"
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-hive-text-muted transition-colors hover:text-hive-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hive-blue-muted"
          >
            <CircleHelp className="h-4 w-4 text-hive-blue" aria-hidden />
            Help
          </Link>
          <div
            className="hidden h-4 w-px bg-hive-border sm:block"
            aria-hidden
          />
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full border border-hive-border bg-hive-soft-sky font-mono text-xs font-medium text-hive-navy"
              aria-label="Account"
            >
              JD
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
