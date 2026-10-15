import type { ReactNode } from "react";

import { HiveCustomerNav } from "./HiveCustomerNav";
import { HiveCustomerWordmark } from "./HiveCustomerWordmark";

type HiveCustomerShellProps = {
  children: ReactNode;
  intakeRunId?: string | null;
  exploreHiveHref?: string | null;
  exploreDisabled?: boolean;
};

export function HiveCustomerShell({
  children,
  intakeRunId,
  exploreHiveHref,
  exploreDisabled,
}: HiveCustomerShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-customerHive-surface font-sans text-customerHive-on-surface antialiased">
      <header className="fixed left-0 top-0 z-50 w-full border-b border-customerHive-border bg-customerHive-surface-lowest">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-6 lg:px-10">
          <div className="flex items-center gap-6">
            <HiveCustomerWordmark />
            <HiveCustomerNav
              intakeRunId={intakeRunId}
              exploreHiveHref={exploreHiveHref}
              exploreDisabled={exploreDisabled}
            />
          </div>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full bg-customerHive-primary"
            aria-hidden
          >
            <span className="material-symbols-outlined text-[18px] text-white">person</span>
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col pt-16">{children}</main>
    </div>
  );
}
