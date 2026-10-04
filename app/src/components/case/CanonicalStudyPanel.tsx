"use client";

import type { CanonicalCaseSnapshot } from "@hiveforyou/shared/case-intelligence/3";
import type { ProView } from "@hiveforyou/shared/projections";

import type { ProvenanceIndex } from "@/lib/case/provenance-index";

import { EvidenceChip } from "./EvidenceChip";

type CanonicalStudyPanelProps = {
  snapshot: CanonicalCaseSnapshot;
  proView: ProView;
  provenance: ProvenanceIndex;
  viewMode: "customer" | "pro";
  onOpenEvidence: (claimId: string) => void;
};

function formatValue(snapshot: CanonicalCaseSnapshot, claimId: string): string {
  const claim = snapshot.claims.find((row) => row.id === claimId);
  if (!claim) {
    return "";
  }
  const subject =
    snapshot.entities.find((entity) => entity.id === claim.subjectEntityId)?.label ??
    claim.subjectEntityId;
  const construct = claim.construct.replace(/_/g, " ");
  const value =
    claim.value.kind === "text"
      ? claim.value.text
      : claim.value.kind === "quantity"
        ? `${claim.value.amount}${claim.unit ? ` ${claim.unit}` : ""}`
        : JSON.stringify(claim.value);
  return `${subject}: ${construct} — ${value}`;
}

export function CanonicalStudyPanel({
  snapshot,
  proView,
  provenance,
  viewMode,
  onOpenEvidence,
}: CanonicalStudyPanelProps) {
  const entitiesById = new Map(snapshot.entities.map((entity) => [entity.id, entity]));

  return (
    <div className="space-y-10" data-testid="canonical-study-panel">
      <section>
        <h2 className="font-serif text-xl font-bold text-hive-navy">Case understanding</h2>
        <ul className="mt-4 space-y-3">
          {snapshot.claims.slice(0, 10).map((claim) => (
            <li
              key={claim.id}
              className="rounded-hive-lg border border-hive-border bg-hive-surface px-4 py-3 font-sans text-sm text-hive-navy"
            >
              {formatValue(snapshot, claim.id)}
              <div className="mt-2 flex flex-wrap gap-1">
                {(provenance.byClaimId.get(claim.id) ?? []).map((ref, index) => (
                  <EvidenceChip
                    key={ref.id}
                    label={ref.logicalTitle ?? ref.sourceFilename ?? `Source ${index + 1}`}
                    onClick={() => onOpenEvidence(claim.id)}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-serif text-xl font-bold text-hive-navy">Key facts</h2>
        <ul className="mt-4 space-y-2">
          {snapshot.claims.map((claim) => (
            <li key={claim.id} className="rounded-hive-lg border border-hive-border px-4 py-3 text-sm">
              {formatValue(snapshot, claim.id)}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-serif text-xl font-bold text-hive-navy">Chronology</h2>
        <ol className="mt-4 space-y-3">
          {snapshot.events.map((event) => (
            <li key={event.id} className="rounded-hive-lg border border-hive-border px-4 py-3 text-sm">
              <p>{formatValue(snapshot, event.claimId)}</p>
              <p className="mt-1 text-xs text-hive-text-muted">
                {event.occurredOn ?? event.effectivePeriod?.start ?? "Undated anchor"}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="font-serif text-xl font-bold text-hive-navy">Decisions / plans / observations</h2>
        <ul className="mt-4 space-y-2">
          {snapshot.claims
            .filter((claim) =>
              ["planned", "required", "decided", "observed", "current"].includes(claim.role),
            )
            .map((claim) => (
              <li key={claim.id} className="rounded-hive-lg border border-hive-border px-4 py-3 text-sm">
                {formatValue(snapshot, claim.id)} ({claim.role})
              </li>
            ))}
        </ul>
      </section>

      {snapshot.changes.length ? (
        <section>
          <h2 className="font-serif text-xl font-bold text-hive-navy">Changes</h2>
          <ul className="mt-4 space-y-2">
            {snapshot.changes.map((change) => (
              <li key={change.id} className="rounded-hive-lg border border-hive-border px-4 py-3 text-sm">
                {change.construct.replace(/_/g, " ")}: {formatValue(snapshot, change.fromClaimId)} →{" "}
                {formatValue(snapshot, change.toClaimId)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {snapshot.conflicts.length ? (
        <section>
          <h2 className="font-serif text-xl font-bold text-hive-navy">Conflicts</h2>
          <ul className="mt-4 space-y-2">
            {snapshot.conflicts.map((conflict) => (
              <li key={conflict.id} className="rounded-hive-lg border border-hive-error/30 px-4 py-3 text-sm">
                {conflict.kind}: {conflict.claimIds.map((id) => formatValue(snapshot, id)).join(" vs ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {snapshot.unresolved.filter((item) => item.kind === "missing_information").length ? (
        <section>
          <h2 className="font-serif text-xl font-bold text-hive-navy">Missing information</h2>
          <ul className="mt-4 space-y-2">
            {snapshot.unresolved
              .filter((item) => item.kind === "missing_information")
              .map((item) => (
                <li
                  key={item.id}
                  className="rounded-hive-lg border border-dashed border-hive-border px-4 py-3 text-sm text-hive-text-muted"
                >
                  {item.description}
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {viewMode === "pro" ? (
        <section>
          <h2 className="font-serif text-xl font-bold text-hive-navy">Technical claim index</h2>
          <div className="mt-4 overflow-x-auto rounded-hive-xl border border-hive-border">
            <table className="min-w-full divide-y divide-hive-border font-mono text-xs">
              <thead className="bg-hive-page">
                <tr>
                  <th className="px-3 py-2 text-left">id</th>
                  <th className="px-3 py-2 text-left">construct</th>
                  <th className="px-3 py-2 text-left">role</th>
                  <th className="px-3 py-2 text-left">subject</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hive-border">
                {proView.claims.map((claim) => (
                  <tr key={claim.id}>
                    <td className="px-3 py-2">{claim.id}</td>
                    <td className="px-3 py-2">{claim.claimType}</td>
                    <td className="px-3 py-2">{claim.temporalKind ?? "—"}</td>
                    <td className="px-3 py-2">
                      {entitiesById.get(claim.subjectEntityId ?? "")?.label ?? claim.subjectEntityId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
