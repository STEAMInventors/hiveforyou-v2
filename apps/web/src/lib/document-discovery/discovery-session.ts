import type { DocumentDiscoveryResult } from "@/lib/document-discovery/types";

const DISCOVERY_SESSION_KEY = "hive-document-discovery-result";
const DISCOVERY_RUN_ID_KEY = "hive-discovery-run-id";

export function rememberClientDiscoveryRunId(discoverRunId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(DISCOVERY_RUN_ID_KEY, discoverRunId);
}

export function readClientDiscoveryRunId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage.getItem(DISCOVERY_RUN_ID_KEY);
}

export function rememberClientDiscovery(discovery: DocumentDiscoveryResult): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(DISCOVERY_SESSION_KEY, JSON.stringify(discovery));
}

export function readClientDiscovery(): DocumentDiscoveryResult | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.sessionStorage.getItem(DISCOVERY_SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as DocumentDiscoveryResult;
  } catch {
    return null;
  }
}
