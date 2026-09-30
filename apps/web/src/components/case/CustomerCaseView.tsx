import type { CustomerView } from "@hiveforyou/shared/projections";
import type {
  ProposedClaim,
  ProposedConflict,
  ProposedEvent,
  ProposedMissingness,
} from "@hiveforyou/shared/canonical-study";

import type { ProvenanceIndex } from "@/lib/case/provenance-index";
import { claimDomainIds } from "@/lib/case/provenance-index";

import { EvidenceChip } from "./EvidenceChip";

type CustomerCaseViewProps = {
  view: CustomerView;
  claimsById: Map<string, ProposedClaim>;
  conflictsById: Map<string, ProposedConflict>;
  missingnessById: Map<string, ProposedMissingness>;
  eventsById: Map<string, ProposedEvent>;
  provenance: ProvenanceIndex;
  selectedDomainId: string | null;
  onOpenEvidence: (claimId: string) => void;
};

export function CustomerCaseView({
  view,
  claimsById,
  conflictsById,
  missingnessById,
  eventsById,
  provenance,
  selectedDomainId,
  onOpenEvidence,
}: CustomerCaseViewProps) {
  return (
    <div className="space-y-8" data-testid="customer-case-view">
      {view.objectiveEcho ? (
        <div className="rounded-hive-xl border border-dashed border-hive-border bg-hive-page/80 p-4">
          <p className="font-sans text-xs font-bold uppercase tracking-wide text-hive-text-muted">
            Your focus · not evidence
          </p>
          <p className="mt-2 font-sans text-sm leading-relaxed text-hive-navy">{view.objectiveEcho}</p>
        </div>
      ) : null}

      {view.sections.map((section) => (
        <section key={section.id} aria-labelledby={`section-${section.id}`}>
          <h2
            id={`section-${section.id}`}
            className="font-serif text-xl font-bold text-hive-navy"
          >
            {section.title}
          </h2>
          <div className="mt-4 space-y-4">
            {section.blocks.map((block, index) => {
              if (block.kind === "narrative") {
                return (
                  <div key={`${section.id}-narrative-${index}`} className="space-y-3">
                    {block.sentences
                      .filter((sentence) =>
                        sentenceMatchesDomain(sentence.claimIds, selectedDomainId, provenance),
                      )
                      .map((sentence, sentenceIndex) => (
                        <FindingCard
                          key={`${section.id}-s-${sentenceIndex}`}
                          text={sentence.text}
                          claimIds={sentence.claimIds}
                          provenance={provenance}
                          onOpenEvidence={onOpenEvidence}
                        />
                      ))}
                  </div>
                );
              }
              if (block.kind === "conflict") {
                const conflict = conflictsById.get(block.conflictId);
                if (!conflict) {
                  return null;
                }
                return <ConflictCard key={block.conflictId} conflict={conflict} />;
              }
              if (block.kind === "gap") {
                const gap = missingnessById.get(block.missingnessId);
                if (!gap) {
                  return null;
                }
                return <GapCard key={block.missingnessId} gap={gap} />;
              }
              if (block.kind === "timeline") {
                return (
                  <ol key={`${section.id}-timeline-${index}`} className="space-y-3">
                    {block.eventIds.map((eventId) => {
                      const event = eventsById.get(eventId);
                      if (!event) {
                        return null;
                      }
                      const claimId = event.id.startsWith("event-")
                        ? event.id.slice("event-".length)
                        : null;
                      return (
                        <li
                          key={eventId}
                          className="rounded-hive-lg border border-hive-border bg-hive-surface px-4 py-3"
                        >
                          <p className="font-sans text-sm text-hive-navy">
                            {event.label || event.eventType}
                            {event.occurredOn ? ` · ${event.occurredOn}` : ""}
                          </p>
                          {claimId ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {(provenance.byClaimId.get(claimId) ?? []).map((ref, refIndex) => (
                                <EvidenceChip
                                  key={ref.id}
                                  label={chipLabel(ref, refIndex)}
                                  onClick={() => onOpenEvidence(claimId)}
                                />
                              ))}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                );
              }
              if (block.kind === "claim_list") {
                return (
                  <ul key={`${section.id}-claims-${index}`} className="space-y-2">
                    {block.claimIds
                      .filter((claimId) =>
                        claimMatchesDomain(claimId, selectedDomainId, provenance),
                      )
                      .map((claimId) => {
                        const claim = claimsById.get(claimId);
                        if (!claim) {
                          return null;
                        }
                        return (
                          <li
                            key={claimId}
                            className="rounded-hive-lg border border-hive-border bg-hive-surface px-4 py-3"
                          >
                            <p className="font-sans text-sm text-hive-navy">{claim.statement}</p>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {(provenance.byClaimId.get(claimId) ?? []).map((ref, refIndex) => (
                                <EvidenceChip
                                  key={ref.id}
                                  label={chipLabel(ref, refIndex)}
                                  onClick={() => onOpenEvidence(claimId)}
                                />
                              ))}
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                );
              }
              return null;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function FindingCard({
  text,
  claimIds,
  provenance,
  onOpenEvidence,
}: {
  text: string;
  claimIds: string[];
  provenance: ProvenanceIndex;
  onOpenEvidence: (claimId: string) => void;
}) {
  const primaryClaimId = claimIds[0];
  const refs = primaryClaimId ? (provenance.byClaimId.get(primaryClaimId) ?? []) : [];

  return (
    <article className="rounded-hive-xl border border-hive-border bg-hive-surface p-4 shadow-hive">
      <p className="font-sans text-sm leading-relaxed text-hive-navy">{text}</p>
      {refs.length && primaryClaimId ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {refs.map((ref, index) => (
            <EvidenceChip
              key={ref.id}
              label={chipLabel(ref, index)}
              onClick={() => onOpenEvidence(primaryClaimId)}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ConflictCard({ conflict }: { conflict: ProposedConflict }) {
  return (
    <div className="rounded-hive-xl border border-amber-200 bg-amber-50/80 p-4">
      <p className="font-sans text-xs font-bold uppercase text-amber-900">Documents disagree</p>
      <p className="mt-2 font-sans text-sm text-hive-navy">{conflict.description}</p>
    </div>
  );
}

function GapCard({ gap }: { gap: ProposedMissingness }) {
  return (
    <div className="rounded-hive-xl border border-dashed border-hive-border bg-hive-page p-4">
      <p className="font-sans text-xs font-bold uppercase text-hive-text-muted">Not in your documents</p>
      <p className="mt-2 font-sans text-sm text-hive-navy">{gap.description}</p>
    </div>
  );
}

function chipLabel(ref: { logicalTitle?: string; sourceFilename?: string; page?: number }, index: number): string {
  const base = ref.logicalTitle ?? ref.sourceFilename ?? `Source ${index + 1}`;
  if (ref.page != null) {
    return `${base} p.${ref.page}`;
  }
  return base;
}

function claimMatchesDomain(
  claimId: string,
  selectedDomainId: string | null,
  provenance: ProvenanceIndex,
): boolean {
  if (!selectedDomainId) {
    return true;
  }
  const domains = claimDomainIds(claimId, provenance);
  return domains.length === 0 || domains.includes(selectedDomainId);
}

function sentenceMatchesDomain(
  claimIds: string[],
  selectedDomainId: string | null,
  provenance: ProvenanceIndex,
): boolean {
  if (!selectedDomainId) {
    return true;
  }
  return claimIds.some((claimId) => claimMatchesDomain(claimId, selectedDomainId, provenance));
}
