"use client";

import { useEffect, useState } from "react";

import { fetchOwnedHives, OwnedHivesFetchError } from "@/lib/cases/cases-client";

import { CaseHiveList } from "./CaseHiveList";

export function CaseExperience() {
  const [hivesLoading, setHivesLoading] = useState(true);
  const [hivesError, setHivesError] = useState<string | null>(null);
  const [ownedHives, setOwnedHives] = useState<
    import("@hiveforyou/shared/cases").OwnedHiveSummary[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setHivesLoading(true);
      setHivesError(null);
      try {
        const payload = await fetchOwnedHives();
        if (cancelled) {
          return;
        }
        setOwnedHives(payload.cases);
      } catch (error) {
        if (!cancelled) {
          const code = error instanceof OwnedHivesFetchError ? error.code : "UNEXPECTED";
          setHivesError(
            code === "UNAUTHENTICATED"
              ? "Sign in to see your Hives."
              : "Could not load your Hives.",
          );
        }
      } finally {
        if (!cancelled) {
          setHivesLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (hivesLoading) {
    return (
      <p className="font-sans text-sm text-hive-text-muted" role="status" data-testid="case-hives-loading">
        Loading your Hives…
      </p>
    );
  }

  if (hivesError) {
    return (
      <div
        className="rounded-hive-xl border border-hive-border bg-hive-surface p-8 text-center"
        data-testid="case-hives-error"
      >
        <p className="font-sans text-sm text-hive-text-muted">{hivesError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="case-hives-shell">
      <CaseHiveList hives={ownedHives} />
    </div>
  );
}
