import type {
  CanonicalStudyArtifact,
  CanonicalStudyTimeline,
  CanonicalStudyTimelineEntry,
} from "@hiveforyou/shared/canonical-study-artifact";

export type CanonicalStudyTimelineAudience = "customer" | "pro";

export type ProjectedCanonicalStudyTimelineEntry = CanonicalStudyTimelineEntry & {
  displayLabel: string;
};

export type ProjectedCanonicalStudyTimeline = Omit<CanonicalStudyTimeline, "dated" | "dateUnknown" | "incomplete"> & {
  dated: ProjectedCanonicalStudyTimelineEntry[];
  dateUnknown: ProjectedCanonicalStudyTimelineEntry[];
  incomplete: ProjectedCanonicalStudyTimelineEntry[];
  audience: CanonicalStudyTimelineAudience;
};

function projectEntry(
  entry: CanonicalStudyTimelineEntry,
  audience: CanonicalStudyTimelineAudience,
): ProjectedCanonicalStudyTimelineEntry {
  return {
    ...entry,
    displayLabel: entry.label,
    eventEvidence: entry.eventEvidence.map((chip) => ({ ...chip })),
    dateEvidence: entry.dateEvidence.map((chip) => ({ ...chip })),
    supportingFactProvenance: entry.supportingFactProvenance.map((chip) => ({ ...chip })),
    relatedEntityIds: [...entry.relatedEntityIds],
    ...(audience === "customer" ? {} : {}),
  };
}

export function projectCanonicalStudyTimeline(
  artifact: CanonicalStudyArtifact,
  input: { audience: CanonicalStudyTimelineAudience },
): ProjectedCanonicalStudyTimeline {
  const timeline = artifact.timeline;
  return {
    audience: input.audience,
    dated: timeline.dated.map((entry) => projectEntry(entry, input.audience)),
    dateUnknown: timeline.dateUnknown.map((entry) => projectEntry(entry, input.audience)),
    incomplete: timeline.incomplete.map((entry) => projectEntry(entry, input.audience)),
    relationships: timeline.relationships.map((rel) => ({ ...rel })),
  };
}
