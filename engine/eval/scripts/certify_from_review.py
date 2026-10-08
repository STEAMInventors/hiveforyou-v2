import json
from pathlib import Path

REPO = Path(r"c:\Users\abhattacharyya\hiveforyou-v2")
VERIFIED = "Aryya Bhattacharyya"

TRIPWIRES = {
    "l003": [
        {"id": "tw_l003_no_conflicts", "mustNotClaim": "conflict", "description": "L003 reviewed reference has zero conflicts; grader must not accept conflict claims."},
        {"id": "tw_l003_three_sessions_before_april", "mustNotClaim": "three_sessions_before_2026_04_01", "description": "Do not treat 3 sessions/week as operative before 2026-04-01 or from Q1/Q2 reports."},
        {"id": "tw_l003_service_start_march_25", "mustNotClaim": "service_start_2026_03_25", "description": "Do not give 2026-03-25 (amended IEP date) as the service start date."},
        {"id": "tw_l003_88_wcpm_not_accuracy", "mustNotClaim": "88_wcpm_as_accuracy_or_percent_target", "description": "Do not report 88 WCPM as accuracy or progress toward the 95% target."},
        {"id": "tw_l003_no_false_5_vs_3_conflict", "mustNotClaim": "conflict:five_vs_three_sessions", "description": "5 vs 3 sessions/week is a dated service change, not a conflict."},
        {"id": "tw_l003_no_false_provision_changes", "mustNotClaim": "changed_goal_eligibility_accommodations", "description": "Do not report goal, eligibility, accommodations, session length, location, or IEP period changed."},
        {"id": "tw_l003_no_orf_on_amendment_dates", "mustNotClaim": "orf_administration_on_amendment_dates", "description": "Do not report ORF on 2026-03-18/25 or any score other than 88 WCPM."},
        {"id": "tw_l003_no_sld_medical_diagnosis", "mustNotClaim": "sld_medical_diagnosis", "description": "Do not call SLD a medical diagnosis."},
        {"id": "tw_l003_no_baseline_accuracy_or_orf", "mustNotClaim": "baseline_accuracy_or_orf_at_2025_iep", "description": "Do not state baseline word-reading accuracy or ORF at the 2025-09-15 IEP."},
        {"id": "tw_l003_no_increased_gen_ed_adopted", "mustNotClaim": "increased_general_education_adopted", "description": "Do not say increased general education time was adopted or implemented."},
        {"id": "tw_l003_no_false_missing_records", "mustNotClaim": "gap:pwn_consent_evaluation_signatures", "description": "Do not flag missing PWN, consent, evaluation, second progress report, or signatures."},
    ],
    "l004": [
        {"id": "tw_l004_no_goal_met", "mustNotClaim": "goal_met_mastered_or_achieved", "description": "Do not say the reading fluency goal was met, mastered, or achieved."},
        {"id": "tw_l004_no_95_wcpm_measured", "mustNotClaim": "95_wcpm_measured_result", "description": "Do not report 95 WCPM as a measured oral reading fluency result."},
        {"id": "tw_l004_no_70_wcpm_on_eval", "mustNotClaim": "70_wcpm_administration_2026_06_05", "description": "Do not report a 70 WCPM administration on 2026-06-05."},
        {"id": "tw_l004_no_accuracy_in_orf_series", "mustNotClaim": "reading_accuracy_in_orf_series", "description": "Do not put 94% reading accuracy in the ORF/WCPM series."},
        {"id": "tw_l004_no_orf_value_conflicts", "mustNotClaim": "conflict:orf_wcpm_longitudinal_series", "description": "Do not report conflicts among 70-96 WCPM or between 96 measured and 95 target."},
        {"id": "tw_l004_no_session_length_as_period", "mustNotClaim": "thirty_minutes_as_service_period", "description": "Do not treat 30 minutes per session as the service period or IEP duration."},
        {"id": "tw_l004_no_iep_changes", "mustNotClaim": "changed_eligibility_services_accommodations_goal", "description": "Do not report changes to eligibility, services, accommodations, or the goal."},
        {"id": "tw_l004_no_eval_rec_as_iep_decision", "mustNotClaim": "evaluation_recommendation_as_iep_decision", "description": "Do not present the evaluation recommendation as an IEP decision."},
        {"id": "tw_l004_no_sld_medical_diagnosis", "mustNotClaim": "sld_medical_diagnosis", "description": "Do not call SLD a medical diagnosis."},
    ],
    "l005": [
        {"id": "tw_l005_no_conflicts", "mustNotClaim": "conflict", "description": "L005 reviewed reference has zero conflicts; grader must not accept conflict claims."},
        {"id": "tw_l005_no_distractor_direction_evidence", "mustNotClaim": "distractor_word_repeat_as_direction_following", "description": "Do not use cough repeat, pencil request, or visual-puzzles observation as direction-following evidence."},
        {"id": "tw_l005_no_cannot_follow_directions", "mustNotClaim": "cannot_follow_directions_mastery", "description": "Do not state cannot follow directions or turn one-to-one accuracy into mastery across settings."},
        {"id": "tw_l005_no_prior_iep_shorter_steps", "mustNotClaim": "2025_iep_shorter_steps_written_directions", "description": "Do not say the 2025 IEP included shorter steps with written directions."},
        {"id": "tw_l005_no_checking_understanding_accommodation", "mustNotClaim": "checking_understanding_iep_accommodation", "description": "Do not say checking understanding before independent work is an IEP accommodation."},
        {"id": "tw_l005_no_eval_rec_as_iep_decision", "mustNotClaim": "evaluation_recommendation_as_iep_decision", "description": "Do not treat evaluation recommendations as IEP decisions or current services."},
        {"id": "tw_l005_no_adhd_or_disorder_identified", "mustNotClaim": "adhd_working_memory_executive_language_disorder", "description": "Do not report ADHD, working-memory, executive-function, or language impairment as identified."},
        {"id": "tw_l005_no_speech_rec_as_no_communication_need", "mustNotClaim": "no_speech_services_means_no_communication_need", "description": "Do not read no direct speech-language services as no communication need."},
        {"id": "tw_l005_no_parent_reminders_as_school_observation", "mustNotClaim": "parent_reminders_as_evaluator_observation", "description": "Do not report parent two-or-three reminders as a school or evaluator observation."},
        {"id": "tw_l005_no_quiet_vs_whole_group_conflict", "mustNotClaim": "conflict:quiet_one_to_one_vs_whole_group", "description": "Do not report conflict between quiet one-to-one accuracy and whole-group difficulty."},
        {"id": "tw_l005_no_eligibility_primary_need_change", "mustNotClaim": "changed_eligibility_or_primary_need", "description": "Do not say eligibility category or primary need changed."},
        {"id": "tw_l005_no_sld_medical_diagnosis", "mustNotClaim": "sld_medical_diagnosis", "description": "Do not call SLD a medical diagnosis."},
    ],
}

CASES = [
    ("l003", "tune", "engine/eval/golden/tune/l003.json"),
    ("l004", "holdout", "engine/eval/golden/holdout/l004.json"),
    ("l005", "tune", "engine/eval/golden/tune/l005.json"),
]

def certify(case_id, split, out_rel):
    review = REPO / "engine/eval/golden/_review" / case_id
    v4 = json.load(open(review / f"{case_id}-golden.v4.json", encoding="utf-8"))
    index = json.load(open(review / f"{case_id}-golden.evidence-index.json", encoding="utf-8"))
    ref_by_id = {r["evidenceRefId"]: r for r in index["refs"]}
    facts = []
    for claim in v4["claims"]:
        first = claim["evidenceRefs"][0]["id"]
        anchor = ref_by_id[first]
        wr = anchor["wordRange"]
        facts.append({
            "id": claim["id"],
            "documentId": anchor["documentId"],
            "pageNumber": anchor["page"],
            "wordRange": [wr["startSeq"], wr["endSeq"] + 1],
            "valueKind": claim["value"]["kind"],
            "value": claim["value"],
            "acceptableModalities": [claim["modality"]],
        })
    gaps = [{"id": g["id"], "gapKind": g["gapKind"], "description": g["description"]} for g in v4["missingInformation"]]
    golden = {
        "caseId": case_id,
        "split": split,
        "corpusDir": f"engine/intake/fixtures/{case_id}",
        "verifiedBy": VERIFIED,
        "draft": False,
        "facts": facts,
        "gaps": gaps,
        "tripwires": TRIPWIRES[case_id],
    }
    out = REPO / out_rel
    out.parent.mkdir(parents=True, exist_ok=True)
    json.dump(golden, open(out, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    json.dump(golden, open(out, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"certified {case_id}: facts={len(facts)} gaps={len(gaps)} tripwires={len(TRIPWIRES[case_id])} -> {out_rel}")

for case_id, split, out_rel in CASES:
    certify(case_id, split, out_rel)