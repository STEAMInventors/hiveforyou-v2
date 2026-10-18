"use client";

import Link from "next/link";

import { rememberClientCaseId } from "@/lib/canonical-study/map-start-request";
import { buildOwnedHiveDocumentsHref } from "@/lib/intake/study-completion-navigation";
import type { OwnedHiveSummary } from "@hiveforyou/shared/cases";

function shortHiveLabel(caseId: string): string {
  return caseId.slice(0, 8);
}

function formatHiveDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
}

export function CaseHiveList({ hives }: { hives: OwnedHiveSummary[] }) {
  if (!hives.length) {
    return (
      <div
        className="rounded-hive-xl border border-hive-border bg-hive-surface p-8 text-center"
        data-testid="case-hive-list-empty"
      >
        <p className="font-sans text-sm text-hive-text-muted">
          You don&apos;t have any Hives yet. Upload documents from the home page to create one.
        </p>
        <Link href="/" className="mt-4 inline-block font-sans text-sm font-bold text-hive-sage">
          Go to upload
        </Link>
      </div>
    );
  }

  return (
    <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2" data-testid="case-hive-list">
      {hives.map((hive) => {
        const href = buildOwnedHiveDocumentsHref(hive);
        return (
          <li key={hive.caseId}>
            <Link
              href={href}
              data-testid={`case-hive-list-item-${hive.caseId}`}
              className="flex w-full flex-col gap-1 rounded-hive-xl border border-hive-border bg-hive-surface px-5 py-4 text-left hover:border-hive-sage/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hive-sage"
              onClick={() => rememberClientCaseId(hive.caseId)}
            >
              <span className="font-serif text-lg font-bold text-hive-navy">
                Hive {shortHiveLabel(hive.caseId)}
              </span>
              <span className="font-sans text-xs text-hive-text-muted">
                Updated {formatHiveDate(hive.updatedAt)}
                {hive.domainId ? ` · ${hive.domainId}` : ""}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
