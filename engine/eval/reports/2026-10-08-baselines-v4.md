# Hive evaluation report

Source: baselines/v4
Split: tune
Cases scored: 2
Cases skipped: 0
Generated: 2026-10-08T04:47:37.597Z

> Baseline replay uses acceptedClaims only; not persisted in T0.2: acceptedConflicts, acceptedMissingInformation, entities (full), voiceProposal. Gap/abstention and conflict tripwires may reflect empty missingInformation/conflicts arrays.

## Summary

| Case | Score | Precision | Recall | Abstention | Provenance | Invariants | Failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| l001 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | 1.0000 | 1 | 118 |
| l002 | 0.1154 | 0.1961 | 0.0578 | 0.0000 | 1.0000 | 1 | 205 |

## Aggregate

- mean score: 0.0577
- mean precision: 0.0980
- mean recall: 0.0289
- mean abstention: 0.0000
- mean provenance: 1.0000
- invariant pass: 2 / 2
- total failures by kind: MISSED_FACT: 280, UNSUPPORTED_CLAIM: 14, VALUE_MISMATCH: 27, WRONG_ABSTENTION: 2

## l001

- score: 0.0000
- precision: 0.0000
- recall: 0.0000
- abstention: 0.0000
- provenance: 1.0000
- invariants: 1
- baseline: `engine/eval/baselines/l001-v4.json`
- baseline runStatus: FAILED
- baseline validationStatus: FAILED
- accepted claims in baseline: 0
- failures by kind: MISSED_FACT: 117, WRONG_ABSTENTION: 1

### Grader feedback

### MISSED_FACT (117)
- Golden fact clm_academic_date has no acceptable candidate match (overlap, value, modality).
  - expected page 1: "Evaluation Date: 2024-10-18"
- Golden fact clm_academic_evaluator has no acceptable candidate match (overlap, value, modality).
  - expected page 1: "Evaluator: Academic evaluator"
- Golden fact clm_academic_focus has no acceptable candidate match (overlap, value, modality).
  - expected page 1: "Focus: Reading achievement and oral reading fluency"
- Golden fact clm_academic_need has no acceptable candidate match (overlap, value, modality).
  - expected page 1: "The evaluation documents an educational need in reading fluency."
- Golden fact clm_academic_recommendation_1 has no acceptable candidate match (overlap, value, modality).
  - expected page 1: "• explicit systematic reading instruction"
- … 112 more (truncated by grader)

### WRONG_ABSTENTION (1)
- Expected missingInformation for golden gap mi_parent_input_not_documented was not reported.

## l002

- score: 0.1154
- precision: 0.1961
- recall: 0.0578
- abstention: 0.0000
- provenance: 1.0000
- invariants: 1
- baseline: `engine/eval/baselines/caleb9-v4.json`
- baseline runStatus: SUCCEEDED
- baseline validationStatus: SUCCEEDED
- accepted claims in baseline: 51
- failures by kind: MISSED_FACT: 163, UNSUPPORTED_CLAIM: 14, VALUE_MISMATCH: 27, WRONG_ABSTENTION: 1

### Grader feedback

### MISSED_FACT (163)
- Golden fact clm_001 has no acceptable candidate match (overlap, value, modality).
  - expected page 1: "Student: Caleb Nguyen"
- Golden fact clm_003 has no acceptable candidate match (overlap, value, modality).
  - expected page 1: "Grade: 2"
- Golden fact clm_004 has no acceptable candidate match (overlap, value, modality).
  - expected page 1: "Grade: 3"
- Golden fact clm_005 has no acceptable candidate match (overlap, value, modality).
  - expected page 1: "Grade: 5"
- Golden fact clm_006 has no acceptable candidate match (overlap, value, modality).
  - expected page 1: "School: Synthetic Elementary School"
- … 158 more (truncated by grader)

### UNSUPPORTED_CLAIM (14)
- Claim claim-comp-target-80 is not grounded to any golden fact by evidence overlap and value.
  - found page 2: "Target: 80% accuracy"
- Claim claim-district is not grounded to any golden fact by evidence overlap and value.
  - found page 1: "District: Synthetic District"
- Claim claim-fluency-target-95 is not grounded to any golden fact by evidence overlap and value.
  - found page 2: "Target: 95 WCPM"
- Claim claim-need-comprehension is not grounded to any golden fact by evidence overlap and value.
  - found page 1: "Reading Comprehension."
- Claim claim-need-fluency is not grounded to any golden fact by evidence overlap and value.
  - found page 1: "category: Specific Learning Disability (SLD) - Reading. Primary educational need: Reading Fluency."
- … 9 more (truncated by grader)

### VALUE_MISMATCH (27)
- Claim claim-grade-2023 overlaps golden fact clm_003 but value differs.
  - expected page 1: "Grade: 2"
  - found page 1: "Grade: 2"
- Claim claim-grade-2024 overlaps golden fact clm_004 but value differs.
  - expected page 1: "Grade: 3"
  - found page 1: "Grade: 3"
- Claim claim-grade-2026 overlaps golden fact clm_005 but value differs.
  - expected page 1: "Grade: 5"
  - found page 1: "Grade: 5"
- Claim claim-category-2023 overlaps golden fact clm_016 but value differs.
  - expected page 1: "Eligibility Category: Specific Learning Disability (SLD) - Reading"
  - found page 1: "Eligibility Category: Specific Learning Disability (SLD) - Reading"
- Claim claim-fluency-goal-id overlaps golden fact clm_030 but value differs.
  - expected page 1: "Goal ID: GOAL_ORF_FLUENCY"
  - found page 1: "Goal ID: GOAL_ORF_FLUENCY"
- … 22 more (truncated by grader)

### WRONG_ABSTENTION (1)
- Expected missingInformation for golden gap gap_001 was not reported.
