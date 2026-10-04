import type { ProposedConflict, ProposedEvent, ProposedMissingness } from "@hiveforyou/shared/canonical-study";

import { domainAccentColor, domainLabel } from "@/lib/case/domain-display";
export type TimelineNodeModel =
  | { kind: "event"; event: ProposedEvent; domainIds: string[] }
  | { kind: "conflict"; conflict: ProposedConflict }
  | { kind: "gap"; gap: ProposedMissingness };

type TimelineProps = {
  nodes: TimelineNodeModel[];
  selectedDomainId: string | null;
  onSelectEvent?: (eventId: string) => void;
};

export function Timeline({ nodes, selectedDomainId, onSelectEvent }: TimelineProps) {
  const filtered = nodes.filter((node) => {
    if (!selectedDomainId || node.kind !== "event") {
      return true;
    }
    return node.domainIds.length === 0 || node.domainIds.includes(selectedDomainId);
  });

  if (!filtered.length) {
    return (
      <p className="font-sans text-sm text-hive-text-muted" data-testid="timeline-empty">
        No timeline items match this filter.
      </p>
    );
  }

  return (
    <ol className="relative space-y-6 border-l-2 border-hive-border pl-6" data-testid="case-timeline">
      {filtered.map((node) => (
        <li key={timelineNodeKey(node)} className="relative">
          <span
            className="absolute -left-[1.65rem] top-1.5 h-3 w-3 rounded-full border-2 border-hive-surface"
            style={{
              backgroundColor:
                node.kind === "event" && node.domainIds[0]
                  ? domainAccentColor(node.domainIds[0])
                  : node.kind === "conflict"
                    ? "#B8922E"
                    : "#4A6B8C",
            }}
            aria-hidden
          />
          {node.kind === "event" ? (
            <button
              type="button"
              className="w-full text-left"
              onClick={() => onSelectEvent?.(node.event.id)}
            >
              <EventCard event={node.event} domainIds={node.domainIds} />
            </button>
          ) : node.kind === "conflict" ? (
            <ConflictCard conflict={node.conflict} />
          ) : (
            <GapCard gap={node.gap} />
          )}
        </li>
      ))}
    </ol>
  );
}

function timelineNodeKey(node: TimelineNodeModel): string {
  if (node.kind === "event") {
    return `event-${node.event.id}`;
  }
  if (node.kind === "conflict") {
    return `conflict-${node.conflict.id}`;
  }
  return `gap-${node.gap.id}`;
}

function EventCard({ event, domainIds }: { event: ProposedEvent; domainIds: string[] }) {
  return (
    <div className="rounded-hive-xl border border-hive-border bg-hive-surface p-4 shadow-hive">
      <div className="flex flex-wrap items-center gap-2">
        {event.occurredOn ? (
          <time className="font-mono text-xs text-hive-text-muted">{event.occurredOn}</time>
        ) : null}
        {domainIds.map((id) => (
          <span
            key={id}
            className="rounded-full px-2 py-0.5 text-xs font-medium text-hive-navy"
            style={{ backgroundColor: `${domainAccentColor(id)}22` }}
          >
            {domainLabel(id)}
          </span>
        ))}
      </div>
      <p className="mt-2 font-sans text-sm font-medium text-hive-navy">{event.label}</p>
      <p className="mt-1 font-sans text-xs text-hive-text-muted">{event.eventType}</p>
    </div>
  );
}

function ConflictCard({ conflict }: { conflict: ProposedConflict }) {
  return (
    <div className="rounded-hive-xl border border-amber-200 bg-amber-50/80 p-4">
      <p className="font-sans text-xs font-bold uppercase tracking-wide text-amber-900">
        Conflict · {conflict.severity}
      </p>
      <p className="mt-2 font-sans text-sm text-hive-navy">{conflict.description}</p>
    </div>
  );
}

function GapCard({ gap }: { gap: ProposedMissingness }) {
  return (
    <div className="rounded-hive-xl border border-dashed border-hive-border bg-hive-page p-4">
      <p className="font-sans text-xs font-bold uppercase tracking-wide text-hive-text-muted">
        Missing information
      </p>
      <p className="mt-2 font-sans text-sm text-hive-navy">{gap.description}</p>
    </div>
  );
}

export function buildTimelineFromProView(input: {
  eventIds: string[];
  events: ProposedEvent[];
  conflicts: ProposedConflict[];
  missingness: ProposedMissingness[];
  structureMapLogicalDomainById: Map<string, string>;
}): TimelineNodeModel[] {
  const eventById = new Map(input.events.map((event) => [event.id, event]));
  const nodes: TimelineNodeModel[] = [];

  for (const eventId of input.eventIds) {
    const event = eventById.get(eventId);
    if (!event) {
      continue;
    }
    const domainIds = new Set<string>();
    for (const ref of event.evidenceRefs ?? []) {
      if (ref.logicalDocumentId) {
        const domainId = input.structureMapLogicalDomainById.get(ref.logicalDocumentId);
        if (domainId) {
          domainIds.add(domainId);
        }
      }
    }
    nodes.push({ kind: "event", event, domainIds: [...domainIds] });
  }

  for (const conflict of input.conflicts) {
    nodes.push({ kind: "conflict", conflict });
  }
  for (const gap of input.missingness) {
    nodes.push({ kind: "gap", gap });
  }

  return nodes;
}
