import { domainPackRecordId, type CaseMapProjectionPackSnapshot } from "@hiveforyou/domain-pack";

import { iepManifest } from "../manifest";

/**
 * Small, construct-driven Case Map zones for IEP.
 * Document types are not used as the primary hierarchy.
 */
export const IEP_CASE_MAP_PROJECTION = {
  domainId: iepManifest.id,
  domainPackId: domainPackRecordId(iepManifest.id),
  domainPackVersion: iepManifest.version,
  rootLabel: "Student & case",
  fallbackZoneLabel: "Other understanding",
  zones: [
    {
      zoneId: "case_identity",
      label: "Case & student",
      order: 10,
      match: {
        constructPrefixes: [
          "student_",
          "child_",
          "case_",
          "school_",
          "grade_",
          "disability_",
          "primary_disability",
        ],
        constructs: ["date_of_birth", "eligibility_status", "eligibility_determination"],
      },
    },
    {
      zoneId: "evaluation_needs",
      label: "Evaluation & needs",
      order: 20,
      match: {
        constructPrefixes: [
          "evaluation_",
          "assessment_",
          "psychoeducational_",
          "referral_",
          "reevaluation_",
        ],
      },
    },
    {
      zoneId: "eligibility",
      label: "Eligibility",
      order: 30,
      match: {
        constructPrefixes: ["eligibility_", "special_education_eligibility"],
      },
    },
    {
      zoneId: "present_levels",
      label: "Present levels",
      order: 40,
      match: {
        constructPrefixes: ["present_level", "plaafp_", "current_performance"],
      },
    },
    {
      zoneId: "goals",
      label: "Goals",
      order: 50,
      match: {
        constructPrefixes: ["goal_", "annual_goal", "objective_", "benchmark_"],
      },
    },
    {
      zoneId: "services_supports",
      label: "Services & supports",
      order: 60,
      match: {
        constructPrefixes: [
          "service_",
          "related_service",
          "accommodation_",
          "modification_",
          "specially_designed_instruction",
        ],
        constructs: ["service_minutes", "service_frequency", "service_location"],
      },
    },
    {
      zoneId: "progress",
      label: "Progress",
      order: 70,
      match: {
        constructPrefixes: ["progress_", "reporting_period", "goal_progress"],
      },
    },
  ],
} satisfies CaseMapProjectionPackSnapshot;
