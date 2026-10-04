"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Crosshair, List, Network } from "lucide-react";

import type { ReactNode } from "react";

import type { ProposedClaim, ProposedConflict } from "@hiveforyou/shared/canonical-study";
import type { CaseMapAttention, CaseMapNode, ResolvedEvidenceRef } from "@hiveforyou/shared/projections";

import { EvidenceDrawer } from "@/components/case/EvidenceDrawer";
import { HiveAppLogo } from "@/components/HiveWordmark";
import { buildProvenanceIndex } from "@/lib/case/provenance-index";
import type { CaseMapViewBundle } from "@/lib/case-map/case-map-view-bundle";
import { fetchCaseMapViewBundle } from "@/lib/case-map/case-map-client";
import { buildCaseMapIndex } from "@/lib/case-map/case-map-tree";
import { useMediaQuery } from "@/lib/case-map/use-media-query";
import {
  attentionsInSubtree,
  defaultGroupId,
  factNodeForClaim,
  linkedSourceCount,
  parentGroupId,
  parentZoneId,
} from "@/lib/case-map/case-map-presentation";

import { CaseMapChronology } from "./CaseMapChronology";
import { CaseMapConflictCard } from "./CaseMapConflictCard";
import { CaseMapFactFocus } from "./CaseMapFactFocus";
import { CaseMapOutline } from "./CaseMapOutline";
import { CaseMapOverview } from "./CaseMapOverview";
import { CaseMapStudyingState } from "./CaseMapStudyingState";
import { CaseMapZoneFocus } from "./CaseMapZoneFocus";

type ViewMode = "map" | "outline";

type SpatialFocus =
  | { kind: "overview" }
  | { kind: "zone"; zoneId: string; groupId: string | null }
  | { kind: "fact"; zoneId: string; groupId: string; factId: string };

type CaseMapExperienceProps = {
  studyRunId: string;
  initialBundle?: CaseMapViewBundle;
};

export function CaseMapExperience({ studyRunId, initialBundle }: CaseMapExperienceProps) {
  const [bundle, setBundle] = useState<CaseMapViewBundle | null>(initialBundle ?? null);
  const [loadError, setLoadError] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [focus, setFocus] = useState<SpatialFocus>({ kind: "overview" });
  const [attentionNodeId, setAttentionNodeId] = useState<string | null>(null);
  const [evidenceClaimId, setEvidenceClaimId] = useState<string | null>(null);
  const [ghostEvidenceRefs, setGhostEvidenceRefs] = useState<ResolvedEvidenceRef[] | null>(null);

  const narrow = useMediaQuery("(max-width: 768px)");
  const effectiveViewMode = narrow ? "outline" : viewMode;

  const load = useCallback(async () => {
    try {
      const loaded = await fetchCaseMapViewBundle(studyRunId);
      setBundle(loaded);
      setLoadError(false);
      return loaded;
    } catch {
      setLoadError(true);
      return null;
    }
  }, [studyRunId]);

  useEffect(() => {
    if (initialBundle) {
      return;
    }
    void load();
  }, [initialBundle, load]);

  useEffect(() => {
    if (!bundle || bundle.status !== "RUNNING") {
      return;
    }
    const timer = setInterval(() => {
      void load();
    }, 2500);
    return () => clearInterval(timer);
  }, [bundle?.status, load]);

  const caseMap = bundle?.caseMap ?? null;
  const mapIndex = useMemo(
    () => (caseMap ? buildCaseMapIndex(caseMap) : null),
    [caseMap],
  );

  useEffect(() => {
    if (!caseMap) {
      return;
    }
    setExpandedNodeIds((prev) => (prev.size ? prev : new Set([caseMap.rootNodeId])));
  }, [caseMap]);

  const provenance = useMemo(
    () => (bundle?.provenance ? buildProvenanceIndex(bundle.provenance) : null),
    [bundle?.provenance],
  );

  const claimsById = useMemo(() => {
    const map = new Map<string, ProposedClaim>();
    if (bundle?.proView) {
      for (const claim of bundle.proView.claims) {
        map.set(claim.id, claim);
      }
    }
    return map;
  }, [bundle?.proView]);

  const evidenceClaim = evidenceClaimId ? claimsById.get(evidenceClaimId) : undefined;
  const evidenceRefs = evidenceClaimId
    ? (provenance?.byClaimId.get(evidenceClaimId) ?? [])
    : [];

  const openFactEvidence = (node: CaseMapNode) => {
    setGhostEvidenceRefs(null);
    const claimId = node.claimIds?.[0];
    if (claimId) {
      setEvidenceClaimId(claimId);
      return;
    }
    if (node.unresolvedId && caseMap) {
      const att = caseMap.attention.find((row) => row.unresolvedId === node.unresolvedId);
      const related = att?.claimIds?.[0];
      if (related) {
        setEvidenceClaimId(related);
        return;
      }
      const unresolved = bundle?.canonicalSnapshot?.unresolved.find(
        (row) => row.id === node.unresolvedId,
      );
      const ref = unresolved?.evidenceRefs?.[0];
      if (ref) {
        setEvidenceClaimId(null);
        setGhostEvidenceRefs([{ ...ref, evidenceRefId: ref.id }]);
      }
    }
  };

  const rememberExpanded = (ids: Array<string | null | undefined>) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (id) {
          next.add(id);
        }
      }
      return next;
    });
  };

  const closeEvidence = () => {
    setEvidenceClaimId(null);
    setGhostEvidenceRefs(null);
    setFocus((current) =>
      current.kind === "fact"
        ? { kind: "zone", zoneId: current.zoneId, groupId: current.groupId }
        : current,
    );
  };

  const backToCase = () => {
    setFocus({ kind: "overview" });
    setSelectedNodeId(caseMap?.rootNodeId ?? null);
    setEvidenceClaimId(null);
    setGhostEvidenceRefs(null);
    setAttentionNodeId(null);
    if (caseMap) {
      setExpandedNodeIds(new Set([caseMap.rootNodeId]));
    }
  };

  if (loadError && !bundle) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center" data-testid="case-map-failed">
        <h1 className="font-serif text-2xl font-bold text-hive-navy">Could not load your case map</h1>
        <p className="mt-3 font-sans text-sm text-hive-text-muted">
          Check your connection and try again.
        </p>
        <button
          type="button"
          className="mt-6 rounded-hive-xl border border-hive-border px-5 py-2 font-sans text-sm font-semibold"
          onClick={() => void load()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!bundle || bundle.status === "RUNNING") {
    return <CaseMapStudyingState rootLabel={caseMap?.nodes.find((n) => n.kind === "root")?.label} />;
  }

  if (bundle.status === "FAILED") {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center" data-testid="case-map-failed">
        <h1 className="font-serif text-2xl font-bold text-hive-navy">We couldn&apos;t finish studying this case</h1>
        <p className="mt-3 font-sans text-sm text-hive-text-muted">
          Your documents are still saved. You can try building the study again from your collection.
        </p>
        <Link href="/" className="mt-6 inline-block font-sans text-sm font-semibold text-hive-sage">
          Back to documents
        </Link>
      </div>
    );
  }

  if (!caseMap || !mapIndex) {
    return <CaseMapStudyingState rootLabel="Your case" />;
  }

  const openZone = (zoneId: string) => {
    const groupId = defaultGroupId(zoneId, mapIndex);
    setFocus({ kind: "zone", zoneId, groupId });
    setSelectedNodeId(zoneId);
    setEvidenceClaimId(null);
    setGhostEvidenceRefs(null);
    rememberExpanded([caseMap.rootNodeId, zoneId, groupId]);
  };

  const selectGroup = (groupId: string) => {
    setFocus((current) =>
      current.kind === "overview" ? current : { kind: "zone", zoneId: current.zoneId, groupId },
    );
    setSelectedNodeId(groupId);
    rememberExpanded([groupId]);
  };

  const openFact = (node: CaseMapNode) => {
    const zoneId = parentZoneId(node.id, mapIndex);
    const groupId = parentGroupId(node.id, mapIndex);
    if (zoneId && groupId) {
      setFocus({ kind: "fact", zoneId, groupId, factId: node.id });
      rememberExpanded([zoneId, groupId]);
    }
    setSelectedNodeId(node.id);
    openFactEvidence(node);
  };

  const openGhost = (node: CaseMapNode) => {
    setAttentionNodeId(node.id);
    setSelectedNodeId(node.id);
    openFactEvidence(node);
  };

  const openClaimEvidence = (claimId: string) => {
    const fact = factNodeForClaim(caseMap, claimId);
    if (fact && effectiveViewMode === "map") {
      openFact(fact);
      return;
    }
    setGhostEvidenceRefs(null);
    setEvidenceClaimId(claimId);
  };

  const sourceCount = (node: CaseMapNode) => linkedSourceCount(node, provenance);

  const revealedAttention = attentionNodeId
    ? attentionsInSubtree(caseMap, attentionNodeId, mapIndex)
    : [];

  const showChronology = effectiveViewMode === "outline" || focus.kind === "overview";

  const evidencePanel = (embedded: boolean) => {
    if (evidenceRefs.length) {
      return (
        <EvidenceDrawer
          embedded={embedded}
          presentation="customer"
          studyRunId={studyRunId}
          claimStatement={embedded ? undefined : evidenceClaim?.statement}
          evidence={evidenceRefs}
          onClose={closeEvidence}
        />
      );
    }
    if (ghostEvidenceRefs?.length) {
      return (
        <EvidenceDrawer
          embedded={embedded}
          presentation="customer"
          studyRunId={studyRunId}
          evidence={ghostEvidenceRefs}
          onClose={closeEvidence}
        />
      );
    }
    return null;
  };

  const zoneLabel =
    focus.kind === "overview" ? null : mapIndex.nodesById.get(focus.zoneId)?.label ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-hive-page text-hive-text" data-testid="case-map-experience">
      <header className="sticky top-0 z-40 border-b border-hive-border/60 bg-hive-surface/90 shadow-hive backdrop-blur-xl">
        <div className="flex h-16 items-center px-6 lg:px-12">
          <HiveAppLogo linkHome />
          <span
            aria-current="page"
            className="ml-8 border-b-2 border-hive-sage pb-1 font-sans text-sm font-bold text-hive-navy"
          >
            Case Map
          </span>
        </div>
      </header>

      <div className="sticky top-16 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-hive-border bg-hive-surface/90 px-6 py-2.5 backdrop-blur-md lg:px-12">
        <nav aria-label="Breadcrumb" data-testid="case-map-breadcrumb" className="flex items-center gap-2 font-mono text-xs">
          {focus.kind === "overview" || effectiveViewMode === "outline" ? (
            <span className="font-bold uppercase tracking-wide text-hive-navy">Case</span>
          ) : (
            <>
              <button
                type="button"
                className="inline-flex items-center gap-1 font-bold text-hive-blue hover:text-hive-navy"
                onClick={backToCase}
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Case
              </button>
              <span className="text-hive-border-strong">/</span>
              {focus.kind === "fact" ? (
                <button
                  type="button"
                  className="uppercase text-hive-text-muted hover:text-hive-navy"
                  onClick={() =>
                    setFocus({ kind: "zone", zoneId: focus.zoneId, groupId: focus.groupId })
                  }
                >
                  {zoneLabel}
                </button>
              ) : (
                <span className="rounded bg-hive-soft-sky/70 px-2 py-0.5 font-bold text-hive-navy">
                  {zoneLabel}
                </span>
              )}
            </>
          )}
        </nav>
        {!narrow ? (
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center rounded-xl border border-hive-border bg-hive-surface p-1 shadow-hive">
              <ViewToggle
                active={effectiveViewMode === "map"}
                label="Map"
                icon={<Network className="h-4 w-4" aria-hidden />}
                onClick={() => setViewMode("map")}
              />
              <ViewToggle
                active={effectiveViewMode === "outline"}
                label="Outline"
                icon={<List className="h-4 w-4" aria-hidden />}
                onClick={() => setViewMode("outline")}
              />
            </div>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-hive-border bg-hive-surface text-hive-blue shadow-hive hover:text-hive-navy"
              data-testid="case-map-reset"
              title="Back to case"
              onClick={backToCase}
            >
              <Crosshair className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      {effectiveViewMode === "map" ? (
        <div data-testid="living-case-map" className="relative flex flex-1 flex-col">
          {focus.kind === "overview" ? (
            <section className="relative flex-1">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(#c1c8c2_1px,transparent_1px)] [background-size:24px_24px] opacity-40"
              />
              <header className="relative z-20 flex flex-col justify-between gap-6 px-6 pb-4 pt-6 md:flex-row md:items-end lg:px-12">
                <div className="space-y-1">
                  <h1 className="font-serif text-4xl font-bold tracking-tight text-hive-navy">
                    Your case, understood.
                  </h1>
                  <p className="font-sans text-sm text-hive-text-muted">
                    Explore what Hive synthesized and verify the evidence behind every finding.
                  </p>
                </div>
              </header>
              <CaseMapOverview
                map={caseMap}
                index={mapIndex}
                onOpenZone={openZone}
                onOpenGhost={openGhost}
                onRevealAttention={setAttentionNodeId}
              />
            </section>
          ) : null}

          {focus.kind === "zone" ? (
            <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 lg:px-12">
              <CaseMapZoneFocus
                map={caseMap}
                index={mapIndex}
                zoneId={focus.zoneId}
                groupId={focus.groupId}
                sourceCount={sourceCount}
                onSelectZone={openZone}
                onSelectGroup={selectGroup}
                onOpenFact={openFact}
                onBack={backToCase}
                onRevealAttention={setAttentionNodeId}
              />
            </div>
          ) : null}

          {focus.kind === "fact" ? (
            <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 items-start gap-6 px-6 py-6 lg:grid-cols-12 lg:px-12">
              <div className="lg:col-span-7">
                <CaseMapFactFocus
                  map={caseMap}
                  index={mapIndex}
                  zoneId={focus.zoneId}
                  groupId={focus.groupId}
                  factId={focus.factId}
                  sourceCount={sourceCount}
                  onSelectFact={openFact}
                  onBackToZone={() => {
                    setEvidenceClaimId(null);
                    setGhostEvidenceRefs(null);
                    setFocus({ kind: "zone", zoneId: focus.zoneId, groupId: focus.groupId });
                  }}
                  onRevealAttention={setAttentionNodeId}
                />
              </div>
              <div className="lg:col-span-5">
                {evidencePanel(true) ?? (
                  <aside
                    data-testid="evidence-drawer"
                    data-presentation="customer"
                    className="rounded-2xl border border-hive-border bg-hive-surface p-5 shadow-hive-md"
                    aria-label="Evidence"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="font-sans text-base font-bold text-hive-navy">Evidence</h2>
                      <button
                        type="button"
                        className="font-sans text-xs font-bold text-hive-text-muted"
                        aria-label="Close"
                        onClick={closeEvidence}
                      >
                        Close
                      </button>
                    </div>
                    <p className="font-sans text-sm text-hive-text-muted">
                      No source is linked to this finding.
                    </p>
                  </aside>
                )}
              </div>
            </div>
          ) : null}

          {revealedAttention.length ? (
            <div className="mx-auto w-full max-w-7xl px-6 pb-8 lg:px-12">
              <AttentionDetail
                items={revealedAttention}
                claimsById={claimsById}
                conflicts={bundle.proView?.conflicts ?? []}
                onOpenEvidence={openClaimEvidence}
              />
              {focus.kind !== "fact" ? evidencePanel(true) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-6 lg:px-12">
          <h1 className="mb-4 font-serif text-3xl font-bold tracking-tight text-hive-navy">
            Your case, understood.
          </h1>
          <CaseMapOutline
            map={caseMap}
            expandedNodeIds={expandedNodeIds}
            selectedNodeId={selectedNodeId}
            attentionItems={caseMap.attention}
            onToggleExpand={(nodeId) => {
              setExpandedNodeIds((prev) => {
                const next = new Set(prev);
                if (next.has(nodeId)) {
                  next.delete(nodeId);
                } else {
                  next.add(nodeId);
                }
                return next;
              });
            }}
            onSelectNode={setSelectedNodeId}
            onOpenFactEvidence={openFactEvidence}
          />
          {evidencePanel(false)}
        </div>
      )}

      {showChronology ? (
        <CaseMapChronology
          entries={caseMap.chronology}
          selectedClaimId={evidenceClaimId}
          onSelect={openClaimEvidence}
        />
      ) : null}
    </div>
  );
}

function AttentionDetail({
  items,
  claimsById,
  conflicts,
  onOpenEvidence,
}: {
  items: CaseMapAttention[];
  claimsById: Map<string, ProposedClaim>;
  conflicts: ProposedConflict[];
  onOpenEvidence: (claimId: string) => void;
}) {
  return (
    <section
      data-testid="case-map-attention-detail"
      className="rounded-2xl border border-[#B8922E]/30 bg-[#B8922E]/5 p-4"
    >
      <ul className="space-y-4">
        {items.map((item) => {
          const conflict = item.conflictId
            ? conflicts.find((row) => row.id === item.conflictId)
            : undefined;
          return (
            <li key={item.id}>
              <p className="font-sans text-sm text-hive-navy">{item.label}</p>
              {conflict ? (
                <div className="mt-3">
                  <CaseMapConflictCard
                    conflict={conflict}
                    claimsById={claimsById}
                    onOpenEvidence={onOpenEvidence}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ViewToggle({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`case-map-view-${label.toLowerCase()}`}
      className={[
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-sm font-bold",
        active ? "bg-hive-soft-sky text-hive-navy" : "text-hive-text-muted hover:text-hive-navy",
      ].join(" ")}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
