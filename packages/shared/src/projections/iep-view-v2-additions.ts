import type { DomainPackViewConfig } from "./domain-pack-view-config";
import type { CardStatus } from "./case-view-v2";
import type { PackChangeRule } from "./change-rules";
import type { PackVoice } from "./voice";
import type { MeasureDirection } from "./story-narrative-v2";

export interface PackAnatomySection {
  sectionId: string;
  label: string;
  entityTypes: string[];
  measures?: string[];
}

export type PackClientRules = {
  subjectRule: string;
  bannedPhrases: string[];
};

export interface DomainPackViewConfigV2 extends DomainPackViewConfig {
  anatomy: { sections: PackAnatomySection[] };
  statusWords: Record<CardStatus, string>;
  changeRules: PackChangeRule[];
  voice: PackVoice;
  rules: PackClientRules;
  /** Progress direction by measure root; omit evaluation-style scores. */
  measureDirection?: Record<string, MeasureDirection>;
}

export const IEP_DOMAIN_VIEW: DomainPackViewConfigV2 = {
  domainId: "iep",
  breadcrumb: "Special Education / IEP",
  meetingHeadline: "Your case is ready for the meeting.",
  voice: {
    subjectDefault: "your child",
    documentsNoun: "your documents",
    planNoun: "IEP",
    eventNoun: "meeting",
    otherPartyNoun: "the school",
    helperNoun: "Hive",
    extraColdWords: ["don't worry", "rest assured", "simply", "just", "obviously"],
  },
  rules: {
    subjectRule:
      "Never make the school or district the grammatical subject. Use you, your child, the documents, or Hive.",
    bannedPhrases: [],
  },
  changeRules: [
    { construct: "grade_level", changeDetection: "ignore" },
    { construct: "iep_period", changeDetection: "ignore" },
    { construct: "meeting_date", changeDetection: "ignore" },
  ],
  anatomy: {
    sections: [
      {
        sectionId: "goals",
        label: "Goals",
        entityTypes: ["annual_goal"],
        measures: [
          "annual_goal_id",
          "annual_goal_target",
          "baseline",
          "oral_reading_fluency",
          "annual_goal_target_met",
        ],
      },
      {
        sectionId: "services",
        label: "Services",
        entityTypes: ["service"],
        measures: ["service_frequency", "service_session_length", "specially_designed_instruction_requirement"],
      },
      {
        sectionId: "accommodations",
        label: "Accommodations",
        entityTypes: ["accommodation"],
        measures: ["accommodation_time_multiplier", "accommodation_provided"],
      },
      {
        sectionId: "eligibility",
        label: "Eligibility",
        entityTypes: ["eligibility_determination"],
        measures: ["special_education_eligibility", "eligibility_category", "primary_educational_need"],
      },
      {
        sectionId: "evaluation",
        label: "Evaluation",
        entityTypes: ["evaluation"],
        measures: ["standard_score", "performance_relative_to_age_expectations", "primary_educational_need"],
      },
      {
        sectionId: "dates",
        label: "Dates",
        entityTypes: ["iep_document"],
        measures: ["iep_period", "reevaluation_planning_date"],
      },
    ],
  },
  measureDirection: {
    wcpm: "higher_is_better",
    oral_reading_fluency: "higher_is_better",
    percent_accuracy: "higher_is_better",
    reading_accuracy: "higher_is_better",
  },
  statusWords: {
    two_versions: "Two versions",
    worth_a_question: "Worth a question",
    changed: "Changed",
    not_in_your_documents: "Not in your documents",
    looks_clear: "Looks clear",
    reference: "",
  },
};

export function domainPackViewConfigForDomainId(domainId: string): DomainPackViewConfigV2 | null {
  if (domainId.includes("special_education") || domainId.includes("iep")) {
    return IEP_DOMAIN_VIEW;
  }
  return null;
}
