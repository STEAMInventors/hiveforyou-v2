/** Interim measure → section mapping until canonical-study-proposal/5 entity links. */

export const IEP_PRO_ONLY_MEASURES = [
  "date_of_birth",
  "enrolled_school",
  "school_district",
  "global_cognitive_limitation_primary_explanation",
  "annual_goal_id",
  "mastery_probe_count",
] as const;

export const IEP_MEASURE_LABELS: Record<string, string> = {
  annual_goal_id: "Goal",
  annual_goal_target: "Target",
  baseline: "Baseline",
  oral_reading_fluency: "Oral reading fluency",
  annual_goal_target_met: "Goal target met",
  mastery_probe_count: "Mastery probes",
  progress_reporting_frequency: "Progress reporting",
  baseline_accuracy: "Baseline accuracy",
  annual_goal_target_accuracy: "Target accuracy",
  service_frequency: "Service frequency",
  service_session_length: "Session length",
  service_setting: "Service setting",
  specially_designed_instruction_requirement: "Specialized instruction",
  accommodation_time_multiplier: "Extended time",
  accommodation_provided: "Accommodation",
  special_education_eligibility: "Special education eligibility",
  eligibility_category: "Eligibility category",
  primary_educational_need: "Primary educational need",
  proposed_evaluation_areas: "Evaluation areas",
  reading_accuracy: "Reading accuracy",
  standard_score: "Standard score",
  performance_relative_to_age_expectations: "Compared to age expectations",
  speech_intelligibility: "Speech intelligibility",
  separate_educational_need_identified: "Separate educational need",
  service_recommended: "Service recommended",
  cognitive_ability_range: "Cognitive ability range",
  iep_period: "IEP period",
  reevaluation_planning_date: "Reevaluation planning",
};

export const IEP_CODE_LABELS: Record<string, string> = {
  SLD_reading: "Specific learning disability, reading",
  sld_reading: "Specific learning disability, reading",
  SLD_reading_comprehension: "Specific learning disability, reading comprehension",
  reading_comprehension: "reading comprehension",
};

/** Study construct roots that differ from pack anatomy keys. */
export const IEP_MEASURE_ALIASES: Record<string, string> = {
  primary_education_need: "primary_educational_need",
  educational_need_primary: "primary_educational_need",
  oral_reading_fluency_wcpm: "oral_reading_fluency",
  annual_goal_included_in_iep: "annual_goal_included",
};

export function normalizeMeasureRoot(root: string): string {
  const trimmed = root.trim();
  return IEP_MEASURE_ALIASES[trimmed] ?? trimmed;
}

export const IEP_UNIT_DISPLAY: Record<string, string> = {
  standard_score: "standard score",
  WCPM: "words per minute",
  wcpm: "words per minute",
  x: "×",
  "min/session": "minutes per session",
  "min/week": "minutes per week",
  "sessions/week": "sessions per week",
};

export const IEP_ANATOMY_SECTION_MEASURES: Record<string, string[]> = {
  goals: [
    "annual_goal_id",
    "annual_goal_target",
    "annual_goal_reading",
    "baseline",
    "oral_reading_fluency",
    "annual_goal_target_met",
    "annual_goal_included",
    "mastery_probe_count",
    "progress_reporting_frequency",
    "baseline_accuracy",
    "annual_goal_target_accuracy",
  ],
  services: [
    "service_frequency",
    "service_session_length",
    "service_setting",
    "service_minutes",
    "specially_designed_instruction_requirement",
  ],
  accommodations: ["accommodation_time_multiplier", "accommodation_provided"],
  eligibility: [
    "special_education_eligibility",
    "eligibility_status",
    "eligibility_category",
    "primary_educational_need",
  ],
  evaluation: [
    "proposed_evaluation_areas",
    "reading_accuracy",
    "standard_score",
    "performance_relative_to_age_expectations",
    "speech_intelligibility",
    "separate_educational_need_identified",
    "service_recommended",
    "cognitive_ability_range",
  ],
  dates: ["iep_period", "reevaluation_planning_date"],
};

export function iepSectionForMeasure(measure: string): string | null {
  const root = normalizeMeasureRoot(measure.split("|")[0]?.trim() ?? measure);
  for (const [sectionId, measures] of Object.entries(IEP_ANATOMY_SECTION_MEASURES)) {
    if (measures.includes(root)) {
      return sectionId;
    }
  }
  return null;
}

export function isIepProOnlyMeasure(measure: string): boolean {
  const root = normalizeMeasureRoot(measure.split("|")[0]?.trim() ?? measure);
  return (IEP_PRO_ONLY_MEASURES as readonly string[]).includes(root) || iepSectionForMeasure(root) === null;
}
