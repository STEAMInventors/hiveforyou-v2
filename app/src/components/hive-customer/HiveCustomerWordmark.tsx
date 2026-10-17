import Link from "next/link";

import { HiveAppLogo } from "@/components/HiveWordmark";

import { buildMyCasesHref } from "@/lib/intake/study-completion-navigation";

type HiveCustomerWordmarkProps = {
  /** App shell logo targets My Hives, not the public landing upload page. */
  appHome?: boolean;
};

export function HiveCustomerWordmark({ appHome = true }: HiveCustomerWordmarkProps) {
  const href = appHome ? buildMyCasesHref() : "/";

  return (
    <Link
      href={href}
      className="inline-flex rounded-lg px-1.5 py-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-customerHive-secondary/40"
      aria-label={appHome ? "My Hives" : "HiveForYou home"}
    >
      <HiveAppLogo linkHome={false} display="responsive" className="pointer-events-none py-0.5" />
    </Link>
  );
}
