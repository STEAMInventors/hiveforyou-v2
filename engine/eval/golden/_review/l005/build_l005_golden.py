#!/usr/bin/env python3
"""L005 golden reference builder and provenance checker.

REFERENCE / PROVENANCE MATERIAL ONLY. Not Hive runtime code, not grader code.

Usage:
    python3 -I build_l005_golden.py <corpus dir> <output dir>

<corpus dir> holds the six L005 PDFs, manifest.json (filename + sha256) and
document-pages/*.json, the snapshots written by Hive's own extractor
(engine/core/scripts/shadow-golden/ensure-document-pages.ts ->
extractNativeWords, the same path as the worker's DocumentPagesStorage).

What it does:
  1. Checks each snapshot's sourcePdfSha256 against the manifest and against the
     SHA-256 of the PDF bytes.
  2. Locates every evidence quote as consecutive words on its cited page, using
     the same normalization as engine/core/src/document/normalize-quote-text.ts.
     Aborts if any quote is not found or occurs more than once on its page.
  3. Records every quote's word range.
  4. Writes l005-golden.v4.json (canonical-study-proposal/4) and
     l005-golden.evidence-index.json.
"""
import hashlib
import json
import os
import re
import sys
import unicodedata

CASE_ID = "l005"

SRC = {k: f"l005-src-{k}" for k in range(1, 7)}
FILE_OF = {
    "l005-src-1": "01_prior_iep.pdf",
    "l005-src-2": "02_reevaluation_plan.pdf",
    "l005-src-3": "03_psychoeducational_reevaluation.pdf",
    "l005-src-4": "04_speech_language_review.pdf",
    "l005-src-5": "05_reevaluation_eligibility_determination.pdf",
    "l005-src-6": "06_reevaluation_iep.pdf",
}

# --------------------------------------------------------------- word layer

def norm(text):
    """Mirror of normalizeQuoteForMatch in normalize-quote-text.ts."""
    t = unicodedata.normalize("NFKC", text)
    t = re.sub("[‘’‚‛]", "'", t)
    t = re.sub("[“”„‟]", '"', t)
    t = re.sub("[–—−]", "-", t)
    t = t.replace(" ", " ")
    t = re.sub(r"\s*\|\s*", " ", t)
    t = t.strip()
    return re.sub(r"\s+", " ", t)


def sha256_file(path):
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def load_word_layer(corpus):
    manifest = json.load(open(os.path.join(corpus, "manifest.json")))
    by_name = {f["filename"]: f for f in manifest["files"]}
    pages, hash_report = {}, {}
    for sid, fname in FILE_OF.items():
        entry = by_name.get(fname) or sys.exit(f"ABORT: {fname} not in manifest")
        snap = json.load(open(os.path.join(corpus, "document-pages", fname[:-4] + ".json")))
        if snap.get("sourcePdfFileName") != fname:
            sys.exit(f"ABORT: snapshot for {fname} names {snap.get('sourcePdfFileName')}")
        pdf_sha = sha256_file(os.path.join(corpus, fname))
        if not (snap["sourcePdfSha256"] == entry["sha256"] == pdf_sha):
            sys.exit(f"ABORT: sha256 mismatch for {fname}")
        hash_report[sid] = {"filename": fname, "sha256": pdf_sha, "pages": len(snap["documentPages"]["pages"])}
        for p in snap["documentPages"]["pages"]:
            for i, w in enumerate(p["words"]):
                if w["seq"] != i:
                    sys.exit(f"ABORT: {fname} p{p['pageNumber']} seq gap at {i}")
            if p.get("route") != "native":
                sys.exit(f"ABORT: {fname} p{p['pageNumber']} route {p.get('route')}")
            pages[(sid, p["pageNumber"])] = [norm(w["text"]) for w in p["words"]]
        pages[(sid, "documentId")] = snap["documentPages"]["documentId"]
    return pages, hash_report


def find_all(words, quote):
    toks = norm(quote).split(" ")
    return [(s, s + len(toks) - 1) for s in range(len(words) - len(toks) + 1)
            if words[s:s + len(toks)] == toks]

# --------------------------------------------------------------- refs

PAGES = None
EVIDENCE_INDEX = []


def R(doc, page, quote):
    return {"_doc": doc, "_page": page, "_quote": quote}


def finalize_refs(owner, refs):
    out = []
    for n, r in enumerate(refs, 1):
        sid = SRC[r["_doc"]]
        words = PAGES.get((sid, r["_page"]))
        if words is None:
            sys.exit(f"ABORT: {owner}: {sid} has no page {r['_page']}")
        hits = find_all(words, r["_quote"])
        if not hits:
            sys.exit(f"ABORT: {owner}: quote not found on {sid} p{r['_page']}: {r['_quote']!r}")
        if len(hits) > 1:
            sys.exit(f"ABORT: {owner}: quote occurs {len(hits)}x on {sid} p{r['_page']}: {r['_quote']!r}")
        rid = f"{owner}-ev{n}"
        out.append({"id": rid, "sourceDocumentId": sid, "logicalDocumentId": None,
                    "page": r["_page"], "pageEnd": None, "spanStart": None, "spanEnd": None,
                    "quote": r["_quote"], "extractionId": None, "sourceType": "document"})
        EVIDENCE_INDEX.append({
            "evidenceRefId": rid, "owner": owner, "sourceDocumentId": sid,
            "documentId": PAGES[(sid, "documentId")], "page": r["_page"],
            "wordRange": {"startSeq": hits[0][0], "endSeq": hits[0][1]},
            "occurrencesOnPage": len(hits), "quote": r["_quote"],
        })
    return out

# --------------------------------------------------------------- values

def V(kind, **kw):
    base = {"kind": kind, "numberValue": None, "textValue": None, "codeValue": None,
            "booleanValue": None, "entityId": None, "dateValue": None,
            "periodStart": None, "periodEnd": None, "unit": None}
    base.update(kw)
    return base


q = lambda n, unit=None: V("quantity", numberValue=n, unit=unit)
t = lambda s: V("text", textValue=s)
cd = lambda s: V("code", codeValue=s)
b = lambda x: V("boolean", booleanValue=x)
e = lambda i: V("entity_ref", entityId=i)
d = lambda s: V("date", dateValue=s)
per = lambda s, en: V("period", periodStart=s, periodEnd=en)

ENTITIES, CLAIMS, GAPS = [], [], []
ENT_IDS = set()
_n = [0]


def ENT(eid, etype, label, refs, aliases=None):
    ENT_IDS.add(eid)
    ENTITIES.append({"id": eid, "entityType": etype, "label": label,
                     "aliases": aliases, "evidenceRefs": finalize_refs(eid, refs)})


def C(subj, measure, task, admin, value, modality, refs, occurredOn=None, period=None):
    _n[0] += 1
    cid = f"clm_{_n[0]:03d}"
    if subj not in ENT_IDS:
        sys.exit(f"ABORT: {cid} subject {subj} unknown")
    if value["kind"] == "entity_ref" and value["entityId"] not in ENT_IDS:
        sys.exit(f"ABORT: {cid} entity_ref {value['entityId']} unknown")
    unit = value["unit"] if value["kind"] == "quantity" else None
    CLAIMS.append({
        "id": cid, "subjectEntityId": subj,
        "construct": {"measure": measure, "task": task, "administration": admin},
        "value": value, "unit": unit, "modality": modality,
        "effectivePeriod": period, "occurredOn": occurredOn,
        "evidenceRefs": finalize_refs(cid, refs),
    })
    return cid


def PERIOD(start, end):
    return {"start": start, "end": end, "precision": "day"}


# Periods stated in the documents themselves.
IEP_2025 = PERIOD("2025-04-08", "2026-04-07")    # src-1 p1 "IEP Period"
IEP_2026 = PERIOD("2026-04-02", "2027-04-01")    # src-6 p1 "IEP Period"
GOAL_2026 = PERIOD("2026-04-02", "2027-04-01")   # src-6 p3 goal Start Date / Target Date

# Document dates, each stated on the document itself.
D1, D2, D3, D4, D5, D6 = "2025-04-08", "2026-02-03", "2026-03-04", "2026-03-11", "2026-03-25", "2026-04-02"

SP = "special_education"
SI = "specialized_instruction"
LC = "SLD_listening_comprehension"


def build():
    # ============================================================ entities
    ENT("ent_student", "student", "Jordan Lee",
        [R(1, 1, "Student: Jordan Lee"), R(1, 1, "Jordan has a documented following spoken directions concern.")],
        aliases=["Jordan"])
    ENT("ent_school", "school", "Synthetic Elementary School", [R(1, 1, "School: Synthetic Elementary School")])
    ENT("ent_district", "school_district", "Synthetic District",
        [R(1, 1, "District: Synthetic District"), R(2, 1, "Prepared By: District")], aliases=["District"])
    ENT("ent_iep_2025", "iep", "IEP (2025-04-08)",
        [R(1, 1, "Individualized Education Program (IEP)"), R(1, 1, "IEP Date: 2025-04-08")])
    ENT("ent_reeval_plan", "reevaluation_plan", "Reevaluation Plan (2026-02-03)",
        [R(2, 1, "Reevaluation Planning Form"), R(2, 1, "Planning Date: 2026-02-03")])
    ENT("ent_psych_2026", "evaluation_report", "Psychoeducational Reevaluation Report (2026-03-04)",
        [R(3, 1, "Psychoeducational Reevaluation Report"), R(3, 1, "Evaluation Date: 2026-03-04")])
    ENT("ent_sl_2026", "evaluation_report", "Speech-Language Review (2026-03-11)",
        [R(4, 1, "Speech-Language Review SYNTHETIC DEVELOPMENT RECORD"), R(4, 1, "Review Date: 2026-03-11")])
    ENT("ent_elig_2026", "eligibility_determination", "Reevaluation Eligibility Determination (2026-03-25)",
        [R(5, 1, "Reevaluation Eligibility Determination SYNTHETIC DEVELOPMENT RECORD"),
         R(5, 1, "Determination Date: 2026-03-25")])
    ENT("ent_iep_2026", "iep", "Reevaluation IEP (2026-04-02)",
        [R(6, 1, "Individualized Education Program (IEP)"), R(6, 1, "IEP Date: 2026-04-02")])
    ENT("ent_goal_2025", "annual_goal", "Annual goal in the 2025 IEP (no goal ID stated)",
        [R(1, 1, "Given two-step classroom directions, Jordan will begin the requested task within 15 seconds on four of five opportunities.")])
    ENT("ent_goal_reeval", "annual_goal", "Annual goal GOAL_DIRECTIONS_REEVAL",
        [R(6, 3, "Goal ID: GOAL_DIRECTIONS_REEVAL")])

    S = "ent_student"
    I1, P2, P3, P4, E5, I2 = ("ent_iep_2025", "ent_reeval_plan", "ent_psych_2026", "ent_sl_2026",
                              "ent_elig_2026", "ent_iep_2026")
    G1, G2 = "ent_goal_2025", "ent_goal_reeval"

    # ============================================================ student identity
    C(S, "student_name", None, None, t("Jordan Lee"), "observed",
      [R(k, 1, "Student: Jordan Lee") for k in range(1, 7)])
    C(S, "date_of_birth", None, None, d("2015-10-21"), "observed",
      [R(k, 1, "Date of Birth: 2015-10-21") for k in range(1, 7)])
    C(S, "grade_level", None, None, cd("5"), "observed",
      [R(k, 1, "Grade: 5") for k in range(1, 7)])
    C(S, "school", None, None, e("ent_school"), "observed",
      [R(k, 1, "School: Synthetic Elementary School") for k in range(1, 7)])
    C(S, "district", None, None, e("ent_district"), "observed",
      [R(k, 1, "District: Synthetic District") for k in range(1, 7)])

    # ============================================================ 2025 eligibility (recorded in the 2025 IEP)
    C(S, "eligibility_category", None, "eligibility_determination",
      t("Specific Learning Disability (SLD) - Listening Comprehension"), "decided",
      [R(1, 1, "Eligibility Category: Specific Learning Disability (SLD) - Listening Comprehension")],
      occurredOn=D1)
    C(S, "primary_educational_need", None, "eligibility_determination",
      t("Following lengthy spoken directions"), "decided",
      [R(1, 1, "Primary Educational Need: Following lengthy spoken directions")], occurredOn=D1)
    C(S, "is_medical_diagnosis", None, "iep_2025", b(False), "observed",
      [R(1, 1, "This IEP implements the educational eligibility determination. It is not a medical diagnosis.")])
    C(S, "diagnosis_recorded", "adhd_working_memory_language_impairment", "iep_2025", b(False), "observed",
      [R(1, 1, "No ADHD, working-memory disorder, or language-impairment diagnosis is recorded in this IEP.")],
      occurredOn=D1)

    # ============================================================ 01 prior IEP (2025-04-08)
    C(I1, "iep_date", None, None, d(D1), "observed",
      [R(1, 1, "IEP Date: 2025-04-08"), R(1, 1, "The IEP date is 2025-04-08."),
       R(1, 2, "Special Education Teacher: [Synthetic signature omitted] Date: 2025-04-08")])
    C(I1, "iep_period", None, None, per("2025-04-08", "2026-04-07"), "decided",
      [R(1, 1, "IEP Period: 2025-04-08 through 2026-04-07")])
    C(I1, "eligibility_determination_date", None, None, d(D1), "observed",
      [R(1, 1, "Determination Date: 2025-04-08")])
    C(I1, "reports_reevaluation_findings", None, None, b(False), "observed",
      [R(1, 1, "This document does not report later reevaluation findings."),
       R(1, 1, "This present-levels statement is not a later evaluation finding.")])
    C(S, "direction_following_concern", "following_spoken_directions", "present_levels",
      t("documented following spoken directions concern"), "observed",
      [R(1, 1, "Jordan has a documented following spoken directions concern.")], occurredOn=D1)
    C(S, "direction_following_difficulty", "lengthy_spoken_directions", "present_levels",
      t("difficulty following lengthy spoken directions across different settings"), "observed",
      [R(1, 1, "Difficulty following lengthy spoken directions across different settings. Classroom staff")],
      occurredOn=D1)
    C(S, "direction_format_comparison", "lengthy_vs_short_visible_directions", "classroom_staff_report",
      t("lengthy spoken directions are more difficult than short, visible directions"), "observed",
      [R(1, 1, "Classroom staff report that lengthy spoken directions are more difficult than short, visible directions.")],
      occurredOn=D1)
    C(I1, "annual_goal", None, None, e(G1), "decided",
      [R(1, 1, "Given two-step classroom directions, Jordan will begin the requested task within 15 seconds on four of five opportunities.")],
      period=IEP_2025)
    C(G1, "goal_condition", None, None, t("two-step classroom directions"), "planned",
      [R(1, 1, "Given two-step classroom directions,")], period=IEP_2025)
    C(G1, "goal_target", "begin_requested_task_within_15_seconds", None, t("four of five opportunities"), "planned",
      [R(1, 1, "Jordan will begin the requested task within 15 seconds on four of five opportunities.")],
      period=IEP_2025)
    C(G1, "progress_reporting_frequency", None, None, t("at least annually, concurrent with report periods"), "planned",
      [R(1, 2, "Progress toward the annual goal will be reported at least annually, concurrent with report periods.")],
      period=IEP_2025)
    C(I1, "service_frequency", SI, SP, q(3, "sessions/week"), "decided",
      [R(1, 2, "Specialized instruction 3 sessions per week"),
       R(1, 2, "Specialized instruction: 3 sessions per week,")], period=IEP_2025)
    C(I1, "service_session_length", SI, SP, q(30, "minutes"), "decided",
      [R(1, 2, "3 sessions per week 30 minutes per session special education setting 2025-04-08"),
       R(1, 2, "3 sessions per week, 30 minutes per session. Direct")], period=IEP_2025)
    C(I1, "service_location", SI, SP, t("special education setting"), "decided",
      [R(1, 2, "30 minutes per session special education setting 2025-04-08")], period=IEP_2025)
    C(I1, "service_start_date", SI, SP, d("2025-04-08"), "decided",
      [R(1, 2, "special education setting 2025-04-08 Specialized")])
    C(I1, "includes_direct_speech_language_services", None, None, b(False), "decided",
      [R(1, 2, "Direct speech-language services are not included in this IEP.")], period=IEP_2025)
    C(I1, "service_absence_is_evaluation_recommendation", "speech_language", None, b(False), "observed",
      [R(1, 2, "Absence of a speech-language service in this document is not a later evaluation recommendation.")])
    C(I1, "accommodation", "extended_time", None,
      t("Extended time (1.5x) on classroom assignments when directions are oral"), "decided",
      [R(1, 2, "• Extended time (1.5x) on classroom assignments when directions are oral.")], period=IEP_2025)
    C(I1, "includes_accommodation", "break_lengthy_oral_directions_with_written_directions", None, b(False), "observed",
      [R(1, 2, "This IEP does not yet include a requirement to break lengthy oral directions into shorter steps with written directions for multistep classroom tasks.")],
      occurredOn=D1)
    C(I1, "iep_team_roles", None, None,
      t("Parent/Guardian; General Education Teacher; Special Education Teacher"), "observed",
      [R(1, 2, "Parent/Guardian: [Synthetic signature omitted]"),
       R(1, 2, "General Education Teacher: [Synthetic signature omitted]"),
       R(1, 2, "Special Education Teacher: [Synthetic signature omitted]")], occurredOn=D1)

    # ============================================================ 02 reevaluation plan (2026-02-03)
    C(P2, "planning_date", None, None, d(D2), "observed",
      [R(2, 1, "Planning Date: 2026-02-03"), R(3, 1, "Reevaluation plan dated 2026-02-03")])
    C(P2, "prepared_by", None, None, e("ent_district"), "observed", [R(2, 1, "Prepared By: District")])
    C(P2, "document_type", None, None, t("Reevaluation plan"), "observed", [R(2, 1, "Document Type: Reevaluation plan")])
    C(S, "receives_special_education_under_iep", None, None, b(True), "observed",
      [R(2, 1, "Jordan currently receives special education services under an IEP.")], occurredOn=D2)
    C(P2, "reevaluation_purpose", None, None,
      t("review current educational needs related to following spoken directions"), "planned",
      [R(2, 1, "A reevaluation is being planned to review current educational needs related to following spoken directions.")],
      occurredOn=D2)
    C(P2, "reevaluation_question", None, None,
      t("difficulty following lengthy spoken directions across different settings"), "observed",
      [R(2, 1, "The primary reevaluation question for Jordan Lee is difficulty following lengthy spoken directions across different settings."),
       R(3, 1, "The reevaluation question for Jordan Lee is difficulty following lengthy spoken directions across different settings.")],
      occurredOn=D2)
    C(P2, "reports_evaluation_results", None, None, b(False), "observed",
      [R(2, 1, "It does not report completed evaluation results."),
       R(2, 1, "[ ] Completed reevaluation scores"),
       R(2, 1, "No new evaluation results are reported here.")])
    for item in ["[X] Current IEP and progress information",
                 "[X] Teacher information regarding classroom direction-following",
                 "[X] Parent information regarding homework directions"]:
        label = item[4:]
        C(P2, "existing_information_available", re.sub(r"[^a-z]+", "_", label.lower()).strip("_"),
          None, t(label), "observed", [R(2, 1, item)], occurredOn=D2)
    for item in ["[X] Psychoeducational reevaluation", "[X] Speech-language review",
                 "[X] Review of existing educational records"]:
        label = item[4:]
        C(P2, "proposed_evaluation_area", re.sub(r"[^a-z]+", "_", label.lower()).strip("_"),
          None, t(label), "planned", [R(2, 1, item)], occurredOn=D2)
    C(P2, "proposed_evaluation_area", "functional_behavior_assessment", None, b(False), "observed",
      [R(2, 1, "[ ] Functional behavior assessment")], occurredOn=D2)
    C(P2, "assessments_completion_timing", None, None, t("before the reevaluation eligibility meeting"), "planned",
      [R(2, 1, "Assessments listed above will be completed before the reevaluation eligibility meeting.")],
      occurredOn=D2)

    # ============================================================ 03 psychoeducational (2026-03-04)
    C(P3, "evaluation_date", None, None, d(D3), "observed",
      [R(3, 1, "Evaluation Date: 2026-03-04"), R(5, 1, "[X] Psychoeducational Reevaluation - 2026-03-04")])
    C(P3, "evaluator", None, None, t("School psychologist"), "observed", [R(3, 1, "Evaluator: School psychologist")])
    C(P3, "evaluation_reason", None, None,
      t("part of the required review of special education eligibility and educational need"), "observed",
      [R(3, 1, "Jordan is being reevaluated as part of the required review of special education eligibility and educational need.")])
    C(P3, "evaluation_scope", None, None, t("cognitive and task-performance context"), "observed",
      [R(3, 1, "This psychoeducational reevaluation provides cognitive and task-performance context.")])
    C(P3, "substitutes_for_speech_language_review", None, None, b(False), "observed",
      [R(3, 1, "It is not a substitute for a speech-language review and does not assign IEP services.")])
    for item in ["• Reevaluation plan dated 2026-02-03", "• Review of existing educational records",
                 "• Teacher information from Ms. Green", "• Parent information regarding homework",
                 "• Student observation during individual testing"]:
        label = item[2:]
        C(P3, "source_of_information", re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_"), None,
          t(label), "observed", [R(3, 1, item)], occurredOn=D3)
    C(P3, "testing_conditions", None, None, t("individual testing in a quiet room with Jordan and the evaluator"),
      "observed", [R(3, 2, "Individual testing was completed in a quiet room with Jordan and the evaluator.")],
      occurredOn=D3)
    C(S, "multistep_direction_repeat_requests", "multistep_tasks", "psychoeducational_individual_testing",
      t("asked for one direction to be repeated on four of twelve multistep tasks"), "observed",
      [R(3, 2, "During individual testing, Jordan asked for one direction to be repeated on four of twelve multistep tasks."),
       R(3, 5, "During individual testing, Jordan asked for one direction to be repeated on four of twelve multistep tasks.")],
      occurredOn=D3)
    C(S, "task_initiation", "one_step_at_a_time_directions", "psychoeducational_individual_testing",
      t("began tasks without additional prompting"), "observed",
      [R(3, 2, "When directions were presented one step at a time, Jordan began tasks without additional prompting."),
       R(3, 5, "When directions were presented one step at a time, Jordan began tasks without additional prompting.")],
      occurredOn=D3)
    C(S, "task_initiation", "all_at_once_directions", "psychoeducational_individual_testing",
      t("paused before beginning several items"), "observed",
      [R(3, 2, "When directions were presented all at once, Jordan paused before beginning several items.")],
      occurredOn=D3)
    C(S, "verbal_information_task_performance", "hold_and_manipulate_several_pieces_of_verbal_information",
      "psychoeducational_reevaluation", t("less consistent"), "observed",
      [R(3, 4, "Performance was less consistent on tasks requiring Jordan to hold and manipulate several pieces of verbal information at once."),
       R(3, 5, "Performance was less consistent on tasks requiring Jordan to hold and manipulate several pieces of verbal information at once.")],
      occurredOn=D3)
    C(S, "overall_reasoning_performance", None, "psychoeducational_reevaluation",
      t("within the expected range for age"), "observed",
      [R(3, 4, "Overall reasoning performance fell within the expected range for Jordan's age. Age-expected"),
       R(3, 5, "Overall reasoning performance fell within the expected range for Jordan's age. Teacher"),
       R(5, 2, "Overall reasoning performance was described as within the expected range for age.")],
      occurredOn=D3)
    C(S, "diagnosis_identified", "working_memory_adhd_executive_function", "psychoeducational_reevaluation",
      b(False), "observed",
      [R(3, 4, "This report does not identify a working-memory disorder, ADHD, or an executive-function disorder for Jordan.")],
      occurredOn=D3)
    C(S, "classwork_completion", "written_directions_visible", "teacher_report_psychoeducational",
      t("usually completes independent classwork when written directions remain visible"), "observed",
      [R(3, 3, "Ms. Green reported that Jordan usually completes independent classwork when written directions remain visible.")],
      occurredOn=D3)
    C(S, "routine_participation", "short_familiar_routines", "teacher_report_psychoeducational",
      t("participates cooperatively during short, familiar routines"), "observed",
      [R(3, 3, "Ms. Green also noted that Jordan participates cooperatively during short, familiar routines.")],
      occurredOn=D3)
    C(S, "homework_reminders", "homework_with_several_spoken_directions", "parent_report_psychoeducational",
      t("often requires two or three reminders"), "observed",
      [R(3, 3, "Jordan's parent reported that homework involving several spoken directions often requires two or three reminders.")],
      occurredOn=D3)
    C(P3, "pattern_interpretation", None, None, t("setting- and format-specific"), "observed",
      [R(3, 5, "The pattern is setting- and format-specific.")], occurredOn=D3)
    C(P3, "evaluation_recommendation", "break_lengthy_verbal_directions_into_shorter_steps", None,
      t("breaking lengthy verbal directions into shorter steps"), "observed",
      [R(3, 5, "Recommendations include breaking lengthy verbal directions into shorter steps and checking understanding before independent work begins. These")],
      occurredOn=D3)
    C(P3, "evaluation_recommendation", "check_understanding_before_independent_work", None,
      t("checking understanding before independent work begins"), "observed",
      [R(3, 5, "and checking understanding before independent work begins. This report")], occurredOn=D3)
    C(P3, "recommendations_are_current_iep_strategies", None, None, b(False), "observed",
      [R(3, 5, "They are not evidence that the current IEP already provides those classroom strategies,")])
    C(P3, "determines_eligibility_or_assigns_services", None, None, b(False), "observed",
      [R(3, 5, "This report does not determine special education eligibility and does not assign IEP services or annual goals.")])

    # ============================================================ 04 speech-language review (2026-03-11)
    C(P4, "review_date", None, None, d(D4), "observed",
      [R(4, 1, "Review Date: 2026-03-11"), R(4, 1, "This speech-language review was completed on 2026-03-11"),
       R(5, 1, "[X] Speech-Language Review - 2026-03-11")])
    C(P4, "evaluator", None, None, t("Speech-language pathologist"), "observed",
      [R(4, 1, "Evaluator: Speech-language pathologist")])
    C(P4, "review_purpose", None, None,
      t("determine whether a separate speech-language educational need is present and whether direct speech-language services are recommended"),
      "observed",
      [R(4, 1, "The purpose is to determine whether a separate speech-language educational need is present and whether direct speech-language services are recommended.")])
    C(S, "conversational_speech_intelligibility", None, "speech_language_review",
      t("intelligible to an unfamiliar listener throughout the review"), "observed",
      [R(4, 1, "Conversational speech was intelligible to an unfamiliar listener throughout the review. Jordan greeted"),
       R(4, 4, "Interpretation and Recommendations Conversational speech was intelligible to an unfamiliar listener throughout the review.")],
      occurredOn=D4)
    C(S, "oral_direction_following", "two_step_quiet_one_to_one", "speech_language_review",
      t("followed two-step oral directions accurately"), "observed",
      [R(4, 2, "Jordan followed two-step oral directions accurately in a quiet one-to-one setting."),
       R(4, 4, "Jordan followed two-step oral directions accurately in a quiet one-to-one setting.")],
      occurredOn=D4)
    C(S, "oral_direction_following", "three_or_more_steps_presented_once", "speech_language_review",
      t("accuracy decreased"), "observed",
      [R(4, 2, "Accuracy decreased when directions contained three or more steps and were presented only once."),
       R(4, 4, "Accuracy decreased when directions contained three or more steps and were presented only once.")],
      occurredOn=D4)
    C(S, "oral_direction_following", "familiar_one_step_practice_item", "speech_language_review",
      t("completed accurately"), "observed",
      [R(4, 2, "A neighboring practice item used a familiar one-step classroom phrase and was completed accurately.")],
      occurredOn=D4)
    C(S, "direction_following_difficulty", "whole_group_lengthy_directions_with_noise", "teacher_report_speech_language",
      t("greatest difficulty during whole-group instruction when directions were lengthy and competing noise was present"),
      "observed",
      [R(4, 3, "The classroom teacher described the greatest difficulty during whole-group instruction when directions were lengthy and competing noise was present.")],
      occurredOn=D4)
    C(S, "structured_language_performance", "receptive_and_expressive", "speech_language_review",
      t("within the expected range"), "observed",
      [R(4, 3, "On structured language tasks, receptive and expressive language performance fell within the expected range. The phrase"),
       R(4, 4, "On structured language tasks, receptive and expressive language performance fell within the expected range. A speech-language")],
      occurredOn=D4)
    C(P4, "recommends_direct_speech_language_services", None, None, b(False), "observed",
      [R(4, 4, "The review does not recommend direct speech-language services at this time. Not recommending"),
       R(5, 2, "The speech-language review does not recommend direct speech-language services.")], occurredOn=D4)
    C(P4, "no_service_means_no_communication_need", None, None, b(False), "observed",
      [R(4, 4, "Not recommending direct speech-language services is not a finding that Jordan has no communication-related educational needs.")])
    C(P4, "evaluation_recommendation", "shorten_oral_directions_with_written_reference", None,
      t("classroom strategies that shorten lengthy oral directions and provide a written reference when possible"),
      "observed",
      [R(4, 4, "The evaluator recommends classroom strategies that shorten lengthy oral directions and provide a written reference when possible. Classroom")],
      occurredOn=D4)
    C(P4, "recommendations_are_current_iep_services", None, None, b(False), "observed",
      [R(4, 4, "Classroom strategy recommendations are not current IEP services.")])
    C(P4, "determines_eligibility", None, None, b(False), "observed",
      [R(4, 4, "A speech-language review does not determine special education eligibility and does not, by itself, assign IEP accommodations.")])

    # ============================================================ 05 reevaluation eligibility (2026-03-25)
    C(E5, "determination_date", None, None, d(D5), "observed",
      [R(5, 1, "Determination Date: 2026-03-25"), R(6, 1, "Determination Date: 2026-03-25")])
    C(E5, "determination_type", None, None, t("Reevaluation Eligibility Determination"), "observed",
      [R(5, 1, "Determination Type: Reevaluation Eligibility Determination")])
    C(E5, "determined_by", None, None, t("Eligibility team"), "observed", [R(5, 1, "Determination By: Eligibility team")])
    C(E5, "is_medical_diagnosis", None, None, b(False), "observed",
      [R(5, 1, "This document records an educational eligibility determination. It is not a medical diagnosis."),
       R(5, 2, "This is an educational determination, not a medical diagnosis.")])
    for item, ent, task in [("[X] Psychoeducational Reevaluation - 2026-03-04", P3, "psychoeducational_reevaluation"),
                            ("[X] Speech-Language Review - 2026-03-11", P4, "speech_language_review")]:
        C(E5, "evaluation_evidence_reviewed", task, None, e(ent), "observed", [R(5, 1, item)], occurredOn=D5)
    for item in ["[X] Review of existing educational records", "[X] Teacher and parent information recorded in the evaluations"]:
        label = item[4:]
        C(E5, "evaluation_evidence_reviewed", re.sub(r"[^a-z]+", "_", label.lower()).strip("_"), None,
          t(label), "observed", [R(5, 1, item)], occurredOn=D5)
    C(S, "special_education_eligibility", None, "reevaluation_eligibility_determination", b(True), "decided",
      [R(5, 2, "[X] Student continues to meet criteria for special education")], occurredOn=D5)
    C(S, "eligibility_category", None, "reevaluation_eligibility_determination",
      t("Specific Learning Disability (SLD) - Listening Comprehension"), "decided",
      [R(5, 1, "The team determined that Jordan continues to meet eligibility criteria for Specific Learning Disability (SLD) - Listening Comprehension. Eligibility category is unchanged. Primary"),
       R(5, 2, "Eligibility Category: Specific Learning Disability (SLD) - Listening Comprehension"),
       R(6, 1, "Eligibility Category: Specific Learning Disability (SLD) - Listening Comprehension"),
       R(6, 1, "The eligibility category remains Specific Learning Disability (SLD) - Listening Comprehension.")],
      occurredOn=D5)
    C(E5, "eligibility_category_change", None, None, t("None"), "decided",
      [R(5, 2, "Category Change: None.")], occurredOn=D5)
    C(S, "primary_educational_need", None, "reevaluation_eligibility_determination",
      t("Following lengthy spoken directions"), "decided",
      [R(5, 2, "Primary Educational Need: Following lengthy spoken directions"),
       R(6, 1, "Primary Educational Need: Following lengthy spoken directions")], occurredOn=D5)
    C(E5, "primary_need_unchanged", None, None, b(True), "observed",
      [R(5, 1, "Primary educational need remains following spoken directions.")], occurredOn=D5)
    C(S, "requires_specially_designed_instruction", "following_spoken_directions",
      "reevaluation_eligibility_determination", b(True), "decided",
      [R(5, 2, "The team determined that Jordan Lee continues to require specially designed instruction targeting the documented following spoken directions need.")],
      occurredOn=D5)
    C(S, "diagnosis_identified", "adhd_working_memory_language_impairment", "reevaluation_eligibility_determination",
      b(False), "observed",
      [R(5, 1, "This determination does not identify ADHD, a working-memory disorder, or a language impairment."),
       R(6, 1, "The team did not identify ADHD, a working-memory disorder, or a language impairment in this IEP.")],
      occurredOn=D5)

    # ============================================================ 06 reevaluation IEP (2026-04-02)
    C(I2, "iep_date", None, None, d(D6), "observed",
      [R(6, 1, "IEP Date: 2026-04-02"),
       R(6, 3, "District Representative: [Synthetic signature omitted] Date: 2026-04-02")])
    C(I2, "iep_period", None, None, per("2026-04-02", "2027-04-01"), "decided",
      [R(6, 1, "IEP Period: 2026-04-02 through 2027-04-01")])
    C(I2, "implements_eligibility_determination", None, None, e(E5), "decided",
      [R(6, 1, "This reevaluation IEP for Jordan Lee implements the current eligibility determination."),
       R(6, 1, "Determination Date: 2026-03-25")])
    C(I2, "is_medical_diagnosis", None, None, b(False), "observed",
      [R(6, 1, "implements the current eligibility determination. It is not a medical diagnosis.")])
    C(S, "direction_following_need", "following_spoken_directions", "present_levels_2026",
      t("continues to have a documented following spoken directions need"), "observed",
      [R(6, 1, "Jordan continues to have a documented following spoken directions need.")], occurredOn=D6)
    C(S, "direction_format_comparison", "evaluation_summary_2026", "present_levels_2026",
      t("stronger performance with one-step or written-visible directions; greater difficulty with lengthy spoken directions, especially during noisy whole-group instruction"),
      "observed",
      [R(6, 1, "Recent evaluations describe stronger performance with one-step or written-visible directions and greater difficulty with lengthy spoken directions, especially during noisy whole-group instruction.")],
      occurredOn=D6)
    C(I2, "two_step_accuracy_treated_as_mastery", None, None, b(False), "observed",
      [R(6, 1, "Quiet one-to-one two-step accuracy is not treated here as across-setting mastery.")])
    C(I2, "service_frequency", SI, SP, q(3, "sessions/week"), "decided",
      [R(6, 2, "Specialized instruction 3 sessions per week"),
       R(6, 2, "Specialized instruction: 3 sessions per week,")], period=IEP_2026)
    C(I2, "service_session_length", SI, SP, q(30, "minutes"), "decided",
      [R(6, 2, "3 sessions per week 30 minutes per session special education setting 2025-04-08"),
       R(6, 2, "3 sessions per week, 30 minutes per session. This IEP")], period=IEP_2026)
    C(I2, "service_location", SI, SP, t("special education setting"), "decided",
      [R(6, 2, "30 minutes per session special education setting 2025-04-08")], period=IEP_2026)
    C(I2, "service_start_date", SI, SP, d("2025-04-08"), "observed",
      [R(6, 2, "special education setting 2025-04-08 Specialized")])
    C(I2, "includes_direct_speech_language_services", None, None, b(False), "decided",
      [R(6, 2, "This IEP does not include direct speech-language services.")], period=IEP_2026)
    C(I2, "accommodation", "extended_time", None,
      t("Extended time (1.5x) on classroom assignments when directions are oral"), "decided",
      [R(6, 2, "• Extended time (1.5x) on classroom assignments when directions are oral.")], period=IEP_2026)
    C(I2, "accommodation", "break_lengthy_oral_directions_with_written_directions", None,
      t("Break lengthy oral directions into shorter steps and provide written directions for multistep classroom tasks"),
      "decided",
      [R(6, 2, "• Break lengthy oral directions into shorter steps and provide written directions for multistep classroom tasks."),
       R(6, 2, "This IEP carries forward shorter oral directions and written directions for multistep classroom tasks.")],
      period=IEP_2026)
    C(I2, "all_evaluation_recommendations_adopted", None, None, b(False), "observed",
      [R(6, 2, "It does not state that every evaluation recommendation was adopted.")])
    C(I2, "includes_accommodation", "check_understanding_before_independent_work", None, b(False), "observed",
      [R(6, 2, "Checking understanding before independent work, as recommended in the psychoeducational report, is not listed as an IEP accommodation in this document.")],
      occurredOn=D6)
    C(I2, "annual_goal", None, None, e(G2), "decided", [R(6, 3, "Goal ID: GOAL_DIRECTIONS_REEVAL")], period=IEP_2026)
    C(G2, "goal_id", None, None, cd("GOAL_DIRECTIONS_REEVAL"), "observed", [R(6, 3, "Goal ID: GOAL_DIRECTIONS_REEVAL")])
    C(G2, "goal_condition", None, None, t("shortened oral directions with a written reference"), "planned",
      [R(6, 3, "Given shortened oral directions with a written reference,")], period=GOAL_2026)
    C(G2, "goal_target", "begin_requested_classroom_task_without_additional_prompting", None,
      t("four of five opportunities"), "planned",
      [R(6, 3, "Jordan will begin the requested classroom task without additional prompting on four of five opportunities.")],
      period=GOAL_2026)
    C(G2, "goal_start_date", None, None, d("2026-04-02"), "planned", [R(6, 3, "Start Date: 2026-04-02")])
    C(G2, "goal_target_date", None, None, d("2027-04-01"), "planned", [R(6, 3, "Target Date: 2027-04-01")])
    C(G2, "progress_reporting_frequency", None, None, t("at least annually, concurrent with report periods"), "planned",
      [R(6, 3, "Progress toward the annual goal will be reported at least annually, concurrent with report periods.")],
      period=IEP_2026)
    C(I2, "extent_of_nonparticipation", SI, None,
      t("participates with nondisabled peers throughout the school day except during specialized instruction sessions in the special education setting"),
      "decided",
      [R(6, 3, "Jordan will participate with nondisabled peers throughout the school day except during specialized instruction sessions provided in the special education setting.")],
      period=IEP_2026)
    C(I2, "iep_team_roles", None, None,
      t("Parent/Guardian; General Education Teacher; Special Education Teacher; District Representative"),
      "observed",
      [R(6, 3, "Parent/Guardian: [Synthetic signature omitted]"),
       R(6, 3, "General Education Teacher: [Synthetic signature omitted]"),
       R(6, 3, "Special Education Teacher: [Synthetic signature omitted]"),
       R(6, 3, "District Representative: [Synthetic signature omitted]")], occurredOn=D6)

    # ============================================================ missing information
    GAPS.append({
        "id": "gap_001",
        "description": ("The 2026-02-03 reevaluation plan lists \"Current IEP and progress information\" "
                        "as existing information available to the team, and the 2025-04-08 IEP says "
                        "progress toward its annual goal will be reported at least annually. The 2025 "
                        "IEP is supplied, but no progress report or other record of progress toward the "
                        "2025 goal (begin the requested task within 15 seconds on four of five "
                        "opportunities) is supplied. A progress report for the 2025-04-08 IEP would "
                        "answer this."),
        "gapKind": "not_found_in_supplied_documents",
        "subjectEntityId": "ent_goal_2025",
        "relatedConstruct": "progress_reporting_frequency",
        "evidenceRefs": None,
        "proposalLineage": {"proposalItemId": "gap_001", "studyRunId": "golden-l005"},
    })

    voice = {
        "subject": {"value": None, "from": None, "evidenceRefs": None},
        "eventNoun": {"value": None, "from": None, "evidenceRefs": None},
        "helperNoun": {"value": None, "from": None, "evidenceRefs": None},
        "otherPartyNoun": {"value": "the district", "from": "document",
                           "evidenceRefs": finalize_refs("voice_other_party",
                                                         [R(2, 1, "Prepared By: District")])},
        "subjectName": {"value": "Jordan Lee", "from": "document",
                        "evidenceRefs": finalize_refs("voice_subject_name",
                                                      [R(1, 1, "Student: Jordan Lee")])},
    }
    return voice


def main():
    global PAGES
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    corpus, out = sys.argv[1], sys.argv[2]
    PAGES, hash_report = load_word_layer(corpus)
    voice = build()

    proposal = {
        "schemaVersion": "canonical-study-proposal/4",
        "domainId": "iep",
        "entities": ENTITIES,
        "claims": CLAIMS,
        "conflicts": [],
        "missingInformation": GAPS,
        "voiceProposal": voice,
        "modelMetadata": {"providerId": "golden-reference", "modelId": "claude-opus-5-5",
                          "proposalMode": "fixture"},
        "proposedAt": "2026-10-08T00:00:00.000Z",
    }
    os.makedirs(out, exist_ok=True)
    json.dump(proposal, open(os.path.join(out, "l005-golden.v4.json"), "w"), indent=2, ensure_ascii=False)
    json.dump({"caseId": CASE_ID, "wordLayer": "document-pages (extractNativeWords via ensure-document-pages.ts)",
               "wordRangeStatus": "verified",
               "sourceIds": FILE_OF, "sourceHashes": hash_report, "refs": EVIDENCE_INDEX},
              open(os.path.join(out, "l005-golden.evidence-index.json"), "w"), indent=2, ensure_ascii=False)

    mods = {}
    for c in CLAIMS:
        mods[c["modality"]] = mods.get(c["modality"], 0) + 1
    print(f"entities={len(ENTITIES)} claims={len(CLAIMS)} conflicts=0 gaps={len(GAPS)} "
          f"refs={len(EVIDENCE_INDEX)} (all quotes verified, none repeated on its page) modalities={mods}")


if __name__ == "__main__":
    main()
