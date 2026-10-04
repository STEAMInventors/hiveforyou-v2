import type { ProposedClaim, ProposedConflict } from "@hiveforyou/shared/canonical-study";

type CaseMapConflictCardProps = {
  conflict: ProposedConflict;
  claimsById: Map<string, ProposedClaim>;
  onOpenEvidence: (claimId: string) => void;
};

export function CaseMapConflictCard({
  conflict,
  claimsById,
  onOpenEvidence,
}: CaseMapConflictCardProps) {
  const sides = conflict.claimIds
    .map((id) => claimsById.get(id))
    .filter((claim): claim is ProposedClaim => Boolean(claim));

  return (
    <div
      data-testid="case-map-conflict"
      className="rounded-hive-xl border border-hive-sage/50 bg-hive-soft-sky/40 p-4"
    >
      <p className="font-sans text-xs font-semibold uppercase tracking-wide text-[#B8922E]">
        Needs attention
      </p>
      <ul className="mt-3 space-y-2">
        {sides.map((claim) => (
          <li key={claim.id} className="flex items-start justify-between gap-3">
            <div>
              <p className="font-sans text-sm font-medium text-hive-navy">
                {formatClaimValue(claim)}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 font-sans text-xs font-semibold text-hive-sage hover:underline"
              onClick={() => onOpenEvidence(claim.id)}
            >
              Evidence
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatClaimValue(claim: ProposedClaim): string {
  const statement = claim.statement.trim();
  return statement || claim.claimType;
}
