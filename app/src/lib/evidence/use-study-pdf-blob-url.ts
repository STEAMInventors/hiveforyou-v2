"use client";

import { useEffect, useState } from "react";

import type { EvidencePdfRenderState } from "@/components/evidence/EvidencePdfPageCanvas";

/** Fetch study PDF bytes from our API and expose a blob URL for embed/canvas preview. */
export function useStudyPdfBlobUrl(apiUrl: string | null, enabled: boolean) {
  const [state, setState] = useState<EvidencePdfRenderState>(enabled && apiUrl ? "loading" : "error");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !apiUrl) {
      setState("error");
      setBlobUrl(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    const cleanUrl = apiUrl.split("#")[0]!;

    setState("loading");
    setBlobUrl(null);

    void fetch(cleanUrl, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          throw new Error("JSON response");
        }
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setState("error");
          setBlobUrl(null);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [apiUrl, enabled]);

  return { state, blobUrl };
}
