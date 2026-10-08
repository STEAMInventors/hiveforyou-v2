# Hive evaluation report

Source: baselines/v4.1
Split: tune
Cases scored: 2
Cases skipped: 0
Generated: 2026-10-08T04:47:48.255Z

> Baseline replay uses acceptedClaims only; not persisted in T0.2: acceptedConflicts, acceptedMissingInformation, entities (full), voiceProposal. Gap/abstention and conflict tripwires may reflect empty missingInformation/conflicts arrays.

## Summary

| Case | Score | Precision | Recall | Abstention | Provenance | Invariants | Failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| l001 | 0.1462 | 0.2308 | 0.1026 | 0.0000 | 1.0000 | 1 | 146 |
| l002 | 0.1787 | 0.3019 | 0.0925 | 0.0000 | 1.0000 | 1 | 195 |

## Aggregate

- mean score: 0.1624
- mean precision: 0.2663
- mean recall: 0.0975
- mean abstention: 0.0000
- mean provenance: 1.0000
- invariant pass: 2 / 2
- total failures by kind: MISSED_FACT: 262, UNSUPPORTED_CLAIM: 20, VALUE_MISMATCH: 57, WRONG_ABSTENTION: 2

## l001

- score: 0.1462
- precision: 0.2308
- recall: 0.1026
- abstention: 0.0000
- provenance: 1.0000
- invariants: 1
- baseline: `engine/eval/baselines/l001-v4.1.json`
- baseline runStatus: SUCCEEDED
- baseline validationStatus: SUCCEEDED
- accepted claims in baseline: 52
- failures by kind: MISSED_FACT: 105, UNSUPPORTED_CLAIM: 7, VALUE_MISMATCH: 33, WRONG_ABSTENTION: 1

### Grader feedback

### MISSED_FACT (105)
- Golden fact clm_academic_evaluator has no acceptable candidate match (overlap, value, modality).
  - expected page 1: "Evaluator: Academic evaluator"
- Golden fact clm_academic_focus has no acceptable candidate match (overlap, value, modality).
  - expected page 1: "Focus: Reading achievement and oral reading fluency"
- Golden fact clm_academic_recommendation_1 has no acceptable candidate match (overlap, value, modality).
  - expected page 1: "• explicit systematic reading instruction"
- Golden fact clm_academic_recommendation_2 has no acceptable candidate match (overlap, value, modality).
  - expected page 1: "• repeated oral reading practice"
- Golden fact clm_academic_recommendation_3 has no acceptable candidate match (overlap, value, modality).
  - expected page 1: "• regular progress monitoring"
- … 100 more (truncated by grader)

### UNSUPPORTED_CLAIM (7)
- Claim cl-goal-accuracy is not grounded to any golden fact by evidence overlap and value.
  - found page 2: "Accuracy Criterion: at least 95% accuracy"
- Claim cl-goal-target is not grounded to any golden fact by evidence overlap and value.
  - found page 2: "Target: 75 WCPM"
- Claim cl-grade is not grounded to any golden fact by evidence overlap and value.
  - found page 1: "Grade: 2"
- Claim cl-eligibility-date matches provenance and value for clm_elig_date but modality decided is not acceptable (expected: observed).
  - found page 1: "Determination Date: 2024-11-01"
- Claim cl-sdi-required matches provenance and value for clm_elig_requires_sdi but modality required is not acceptable (expected: decided).
  - found page 1: "The team determined that Maya requires specially designed instruction targeting the documented reading fluency"
- … 2 more (truncated by grader)

### VALUE_MISMATCH (33)
- Claim cl-reading-instruction-recommendation overlaps golden fact clm_academic_recommendation_1 but value differs.
  - expected page 1: "• explicit systematic reading instruction"
  - found page 1: "• explicit systematic reading instruction"
- Claim cl-oral-reading-practice overlaps golden fact clm_academic_recommendation_2 but value differs.
  - expected page 1: "• repeated oral reading practice"
  - found page 1: "• repeated oral reading practice"
- Claim cl-progress-monitoring-recommendation overlaps golden fact clm_academic_recommendation_3 but value differs.
  - expected page 1: "• regular progress monitoring"
  - found page 1: "• regular progress monitoring"
- Claim cl-connected-text-observation overlaps golden fact clm_connected_text_slow but value differs.
  - expected page 1: "Connected-text reading is slow and effortful."
  - found page 1: "Connected-text reading is slow and effortful. Frequent pauses were observed. Isolated word reading is stronger than"
- Claim cl-word-reading-comparison overlaps golden fact clm_connected_text_slow but value differs.
  - expected page 1: "Connected-text reading is slow and effortful."
  - found page 1: "connected-text reading."
- … 28 more (truncated by grader)

### WRONG_ABSTENTION (1)
- Expected missingInformation for golden gap mi_parent_input_not_documented was not reported.

## l002

- score: 0.1787
- precision: 0.3019
- recall: 0.0925
- abstention: 0.0000
- provenance: 1.0000
- invariants: 1
- baseline: `engine/eval/baselines/caleb9-v4.1.json`
- baseline runStatus: SUCCEEDED
- baseline validationStatus: SUCCEEDED
- accepted claims in baseline: 53
- failures by kind: MISSED_FACT: 157, UNSUPPORTED_CLAIM: 13, VALUE_MISMATCH: 24, WRONG_ABSTENTION: 1

### Grader feedback

### MISSED_FACT (157)
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
- … 152 more (truncated by grader)

### UNSUPPORTED_CLAIM (13)
- Claim clm-005 is not grounded to any golden fact by evidence overlap and value.
  - found page 1: "School: Synthetic Elementary School"
- Claim clm-006 is not grounded to any golden fact by evidence overlap and value.
  - found page 1: "District: Synthetic District"
- Claim clm-009 is not grounded to any golden fact by evidence overlap and value.
  - found page 1: "category: Specific Learning Disability (SLD) - Reading. Primary educational need: Reading Fluency."
- Claim clm-010 is not grounded to any golden fact by evidence overlap and value.
  - found page 2: "Caleb requires specially designed instruction to address the documented reading-fluency need."
- Claim clm-014 is not grounded to any golden fact by evidence overlap and value.
  - found page 2: "Target: 95 WCPM"
- … 8 more (truncated by grader)

### VALUE_MISMATCH (24)
- Claim clm-002 overlaps golden fact clm_003 but value differs.
  - expected page 1: "Grade: 2"
  - found page 1: "Grade: 2"
- Claim clm-003 overlaps golden fact clm_004 but value differs.
  - expected page 1: "Grade: 3"
  - found page 1: "Grade: 3"
- Claim clm-004 overlaps golden fact clm_005 but value differs.
  - expected page 1: "Grade: 5"
  - found page 1: "Grade: 5"
- Claim clm-013 overlaps golden fact clm_030 but value differs.
  - expected page 1: "Goal ID: GOAL_ORF_FLUENCY"
  - found page 1: "Goal ID: GOAL_ORF_FLUENCY"
- Claim clm-012 overlaps golden fact clm_035 but value differs.
  - expected page 1: "Baseline: 62 WCPM"
  - found page 1: "Baseline: 62 WCPM"
- … 19 more (truncated by grader)

### WRONG_ABSTENTION (1)
- Expected missingInformation for golden gap gap_001 was not reported.
