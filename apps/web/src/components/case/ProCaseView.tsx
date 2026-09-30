import type { ProView } from "@hiveforyou/shared/projections";

import { domainLabel } from "@/lib/case/domain-display";
import type { ProvenanceIndex } from "@/lib/case/provenance-index";

import { EvidenceChip } from "./EvidenceChip";

type ProCaseViewProps = {
  view: ProView;
  provenance: ProvenanceIndex;
  selectedDomainId: string | null;
  onOpenEvidence: (claimId: string) => void;
};

export function ProCaseView({
  view,
  provenance,
  selectedDomainId,
  onOpenEvidence,
}: ProCaseViewProps) {
  const claims = view.claims.filter((claim) => {
    if (!selectedDomainId) {
      return true;
    }
    const domains = provenance.byClaimId.get(claim.id)?.map((ref) => ref.logicalDomainId).filter(Boolean) ?? [];
    return domains.length === 0 || domains.includes(selectedDomainId);
  });

  return (
    <div className="space-y-8" data-testid="pro-case-view">
      <section>
        <h2 className="font-serif text-xl font-bold text-hive-navy">Validated claims</h2>
        <div className="mt-4 overflow-x-auto rounded-hive-xl border border-hive-border">
          <table className="min-w-full divide-y divide-hive-border font-sans text-sm">
            <thead className="bg-hive-page">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-bold uppercase text-hive-text-muted">
                  Statement
                </th>
                <th className="px-4 py-2 text-left text-xs font-bold uppercase text-hive-text-muted">
                  Type
                </th>
                <th className="px-4 py-2 text-left text-xs font-bold uppercase text-hive-text-muted">
                  Temporal
                </th>
                <th className="px-4 py-2 text-left text-xs font-bold uppercase text-hive-text-muted">
                  Evidence
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hive-border bg-hive-surface">
              {claims.map((claim) => (
                <tr key={claim.id}>
                  <td className="px-4 py-3 text-hive-navy">{claim.statement}</td>
                  <td className="px-4 py-3 text-hive-text-muted">{claim.claimType}</td>
                  <td className="px-4 py-3 text-hive-text-muted">{claim.temporalKind ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(provenance.byClaimId.get(claim.id) ?? []).map((ref, index) => (
                        <EvidenceChip
                          key={ref.id}
                          label={ref.logicalTitle ?? ref.sourceFilename ?? `Ref ${index + 1}`}
                          onClick={() => onOpenEvidence(claim.id)}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {view.crossDomainRelationships?.length ? (
        <section>
          <h2 className="font-serif text-xl font-bold text-hive-navy">Cross-domain relationships</h2>
          <ul className="mt-4 space-y-2">
            {view.crossDomainRelationships.map((rel) => (
              <li
                key={rel.id}
                className="rounded-hive-lg border border-hive-border bg-hive-surface px-4 py-3 font-sans text-sm"
              >
                {rel.relationshipType}: {rel.fromEntityId} → {rel.toEntityId}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="font-serif text-xl font-bold text-hive-navy">Domains in this case</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {view.domainIds.map((domainId) => (
            <li
              key={domainId}
              className="rounded-full bg-hive-soft-sky px-3 py-1 font-sans text-xs font-medium text-hive-navy"
            >
              {domainLabel(domainId)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
