/** Study primitive names allowed in pack questions (task 1.3 replaces with primitive map). */
export const PACK_STUDY_PRIMITIVES = [
  "arithmetic",
  "as_of_value",
  "change_over_time",
  "compose_governing_with_amendments",
  "coverage",
  "date_relationships",
  "identifier_link",
  "none_answer_vs_records",
  "party_relation",
  "referenced_not_provided",
  "request_response_pairing",
  "requirement_coverage",
  "restatement_agreement",
  "series_continuity",
  "series_over_time",
  "stated_vs_observed",
  "threshold",
  "window_filter",
] as const;

export type PackStudyPrimitive = (typeof PACK_STUDY_PRIMITIVES)[number];

const PRIMITIVE_SET = new Set<string>(PACK_STUDY_PRIMITIVES);

export function isPackStudyPrimitive(name: string): name is PackStudyPrimitive {
  return PRIMITIVE_SET.has(name);
}
