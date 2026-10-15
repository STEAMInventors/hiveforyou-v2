"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { CanonicalStudyReportProjection } from "@hiveforyou/shared/canonical-study-report-projection";

const HiveUiReportProjectionContext = createContext<CanonicalStudyReportProjection | null>(null);

export function HiveUiReportProjectionProvider({
  projection,
  children,
}: {
  projection: CanonicalStudyReportProjection;
  children: ReactNode;
}) {
  return (
    <HiveUiReportProjectionContext.Provider value={projection}>
      {children}
    </HiveUiReportProjectionContext.Provider>
  );
}

export function useHiveUiReportProjection(): CanonicalStudyReportProjection {
  const value = useContext(HiveUiReportProjectionContext);
  if (!value) {
    throw new Error("useHiveUiReportProjection requires HiveUiReportProjectionProvider");
  }
  return value;
}
