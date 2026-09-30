"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { getOrCreateClientCaseId } from "@/lib/canonical-study/map-start-request";
import { fetchCaseViewBundle } from "@/lib/case/case-client";
import type { CaseViewBundle } from "@/lib/case/case-view-bundle";
import { buildProvenanceIndex } from "@/lib/case/provenance-index";

import { CanonicalStudyPanel } from "./CanonicalStudyPanel";
import { CaseNavigation, type CaseSection } from "./CaseNavigation";
import { CustomerCaseView } from "./CustomerCaseView";
import { DomainFilter } from "./DomainFilter";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { ProCaseView } from "./ProCaseView";
import { SourcesDirectory, SourceInspector, buildSourceList } from "./SourcesDirectory";
import { ViewSwitcher, type CaseViewMode } from "./ViewSwitcher";

export function CaseExperience() {
  const [bundle, setBundle] = useState<CaseViewBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<CaseViewMode>("customer");
  const [section, setSection] = useState<CaseSection>("overview");
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [evidenceClaimId, setEvidenceClaimId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const caseId = getOrCreateClientCaseId();
    void fetchCaseViewBundle({ caseId })
      .then((loaded) => {
        if (!cancelled) {
          setBundle(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load your case.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const provenance = useMemo(
    () => (bundle ? buildProvenanceIndex(bundle.provenance) : null),
    [bundle],
  );

  const claimsById = useMemo(() => {
    const map = new Map<string, import("@hiveforyou/shared/canonical-study").ProposedClaim>();
    if (bundle) {
      for (const claim of bundle.proView.claims) {
        map.set(claim.id, claim);
      }
    }
    return map;
  }, [bundle]);

  const conflictsById = useMemo(() => {
    const map = new Map<string, import("@hiveforyou/shared/canonical-study").ProposedConflict>();
    if (bundle) {
      for (const conflict of bundle.proView.conflicts) {
        map.set(conflict.id, conflict);
      }
    }
    return map;
  }, [bundle]);

  const eventsById = useMemo(() => {
    const map = new Map<string, import("@hiveforyou/shared/canonical-study").ProposedEvent>();
    if (bundle) {
      for (const event of bundle.proView.events) {
        map.set(event.id, event);
      }
    }
    return map;
  }, [bundle]);

  const missingnessById = useMemo(() => {
    const map = new Map<string, import("@hiveforyou/shared/canonical-study").ProposedMissingness>();
    if (bundle) {
      for (const gap of bundle.proView.missingness) {
        map.set(gap.id, gap);
      }
    }
    return map;
  }, [bundle]);

  const logicalDomainById = useMemo(() => {
    const map = new Map<string, string>();
    if (bundle?.structureMap) {
      for (const logical of bundle.structureMap.logicalDocuments) {
        map.set(logical.id, logical.domainId);
      }
    }
    return map;
  }, [bundle]);

  const sourceItems = useMemo(() => {
    if (!bundle) {
      return [];
    }
    return buildSourceList(bundle.structureMap, bundle.sourceDocuments);
  }, [bundle]);

  const selectedSource = sourceItems.find((item) => item.logicalDocumentId === selectedSourceId) ?? null;

  const activeView = viewMode === "customer" ? bundle?.customerView : bundle?.proView;
  const domainIds = activeView?.domainIds ?? bundle?.customerView.domainIds ?? [];

  const evidenceClaim = evidenceClaimId ? claimsById.get(evidenceClaimId) : undefined;
  const evidenceRefs = evidenceClaimId
    ? (provenance?.byClaimId.get(evidenceClaimId) ?? [])
    : [];

  if (loading) {
    return (
      <p className="font-sans text-sm text-hive-text-muted" role="status">
        Loading your case…
      </p>
    );
  }

  if (error || !bundle) {
    return (
      <div className="rounded-hive-xl border border-hive-border bg-hive-surface p-8 text-center">
        <p className="font-sans text-sm text-hive-text-muted">{error ?? "Case unavailable."}</p>
        <Link href="/study" className="mt-4 inline-block font-sans text-sm font-bold text-hive-sage">
          Return to study
        </Link>
      </div>
    );
  }

  if (bundle.studyStatus === "unavailable") {
    return (
      <div
        className="rounded-hive-xl border border-hive-border bg-hive-surface p-8 text-center"
        data-testid="case-unavailable"
      >
        <h1 className="font-serif text-2xl font-bold text-hive-navy">Your case is not ready yet</h1>
        <p className="mt-3 font-sans text-sm text-hive-text-muted">
          Complete document discovery and the case study to see findings here.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link href="/processing" className="font-sans text-sm font-bold text-hive-sage">
            Document discovery
          </Link>
          <Link href="/study" className="font-sans text-sm font-bold text-hive-sage">
            Study my case
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="case-experience" className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs text-hive-text-muted">
            Case · revision {bundle.intelligenceVersion}
          </p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-hive-navy">
            Your case
          </h1>
        </div>
        <ViewSwitcher mode={viewMode} onChange={setViewMode} />
      </header>

      <DomainFilter
        domainIds={domainIds}
        selectedDomainId={selectedDomainId}
        onSelect={setSelectedDomainId}
      />

      <CaseNavigation active={section} onChange={setSection} />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {section === "overview" && viewMode === "customer" && provenance ? (
            <CustomerCaseView
              view={bundle.customerView}
              claimsById={claimsById}
              conflictsById={conflictsById}
              missingnessById={missingnessById}
              eventsById={eventsById}
              provenance={provenance}
              selectedDomainId={selectedDomainId}
              onOpenEvidence={setEvidenceClaimId}
            />
          ) : null}
          {section === "overview" && viewMode === "pro" && provenance ? (
            <ProCaseView
              view={bundle.proView}
              provenance={provenance}
              selectedDomainId={selectedDomainId}
              onOpenEvidence={setEvidenceClaimId}
            />
          ) : null}
          {section === "canonical-study" && bundle.canonicalSnapshot && provenance ? (
            <CanonicalStudyPanel
              snapshot={bundle.canonicalSnapshot}
              proView={bundle.proView}
              provenance={provenance}
              viewMode={viewMode}
              onOpenEvidence={setEvidenceClaimId}
            />
          ) : null}
          {section === "sources" ? (
            <SourcesDirectory
              structureMap={bundle.structureMap}
              sourceDocuments={bundle.sourceDocuments}
              selectedDomainId={selectedDomainId}
              selectedLogicalId={selectedSourceId}
              onSelect={setSelectedSourceId}
            />
          ) : null}
        </div>

        {evidenceClaimId && evidenceRefs.length ? (
          <EvidenceDrawer
            claimStatement={evidenceClaim?.statement}
            evidence={evidenceRefs}
            onClose={() => setEvidenceClaimId(null)}
          />
        ) : null}
        {section === "sources" && selectedSource ? (
          <SourceInspector item={selectedSource} onClose={() => setSelectedSourceId(null)} />
        ) : null}
      </div>
    </div>
  );
}
