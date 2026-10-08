#!/usr/bin/env python3
"""L004 golden reference builder and provenance checker.

REFERENCE / PROVENANCE MATERIAL ONLY. Not Hive runtime code, not grader code.

Usage:
    python3 -I build_l004_golden.py <corpus dir> <output dir>

<corpus dir> holds the five L004 PDFs, manifest.json (filename + sha256) and
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
  4. Writes l004-golden.v4.json (canonical-study-proposal/4) and
     l004-golden.evidence-index.json.
"""
import hashlib
import json
import os
import re
import sys
import unicodedata

CASE_ID = "l004"

SRC = {1: "l004-src-1", 2: "l004-src-2", 3: "l004-src-3", 4: "l004-src-4", 5: "l004-src-5"}
FILE_OF = {
    "l004-src-1": "01_annual_iep.pdf",
    "l004-src-2": "02_progress_report_q1.pdf",
    "l004-src-3": "03_progress_report_q2.pdf",
    "l004-src-4": "04_progress_report_q3.pdf",
    "l004-src-5": "05_academic_evaluation.pdf",
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
    manifest = json.load(open(os.path.join(corpus, "manifest.json"), encoding="utf-8"))
    by_name = {f["filename"]: f for f in manifest["files"]}
    pages, hash_report = {}, {}
    for sid, fname in FILE_OF.items():
        entry = by_name.get(fname) or sys.exit(f"ABORT: {fname} not in manifest")
        snap = json.load(open(os.path.join(corpus, "document-pages", fname[:-4] + ".json"), encoding="utf-8"))
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
IEP_PERIOD = PERIOD("2025-09-10", "2026-09-09")      # src-1 p1 "IEP Period Start/End"
GOAL_PERIOD = PERIOD("2025-09-10", "2026-09-09")     # goal Start Date / Target Date
SVC_PERIOD = PERIOD("2025-09-10", "2026-09-09")      # src-1 p2 Service Start Date / Service Period End

# Document dates, each stated on the document itself.
D1, D2, D3, D4, D5 = "2025-09-10", "2025-11-14", "2026-02-13", "2026-05-15", "2026-06-05"

SP = "special_education"
SRI = "specialized_reading_instruction"
ORF_TASK = "grade_level_connected_text"


def build():
    # ============================================================ entities
    ENT("ent_student", "student", "Daniel Okafor",
        [R(1, 1, "Student: Daniel Okafor"), R(1, 1, "Daniel has a persistent reading concern.")],
        aliases=["Daniel"])
    ENT("ent_school", "school", "Synthetic Elementary School",
        [R(1, 1, "School: Synthetic Elementary School")])
    ENT("ent_district", "school_district", "Synthetic District",
        [R(1, 1, "District: Synthetic District")])
    ENT("ent_iep_2025", "iep", "IEP (2025-09-10)",
        [R(1, 1, "Individualized Education Program (IEP)"), R(1, 1, "IEP Date: 2025-09-10")])
    ENT("ent_progress_q1", "progress_report", "IEP Progress Report Q1 (2025-11-14)",
        [R(2, 1, "IEP Progress Report (Q1)"), R(2, 1, "Report Date: 2025-11-14")])
    ENT("ent_progress_q2", "progress_report", "IEP Progress Report Q2 (2026-02-13)",
        [R(3, 1, "IEP Progress Report (Q2)"), R(3, 1, "Report Date: 2026-02-13")])
    ENT("ent_progress_q3", "progress_report", "IEP Progress Report Q3 (2026-05-15)",
        [R(4, 1, "IEP Progress Report (Q3)"), R(4, 1, "Report Date: 2026-05-15")])
    ENT("ent_academic_eval_2026", "evaluation_report", "Academic Evaluation Report (2026-06-05)",
        [R(5, 1, "Academic Evaluation Report SYNTHETIC DEVELOPMENT RECORD"), R(5, 1, "Evaluation Date: 2026-06-05")])
    ENT("ent_goal_fluency", "annual_goal", "Annual goal GOAL_READING_FLUENCY",
        [R(1, 1, "Goal ID: GOAL_READING_FLUENCY")] + [R(k, 1, "Goal ID: GOAL_READING_FLUENCY") for k in (2, 3, 4)])

    S = "ent_student"
    I1, E5, G = "ent_iep_2025", "ent_academic_eval_2026", "ent_goal_fluency"
    PR = {2: ("ent_progress_q1", "Q1", D2, 78), 3: ("ent_progress_q2", "Q2", D3, 85), 4: ("ent_progress_q3", "Q3", D4, 92)}

    # ============================================================ student identity
    C(S, "student_name", None, None, t("Daniel Okafor"), "observed",
      [R(k, 1, "Student: Daniel Okafor") for k in range(1, 6)])
    C(S, "date_of_birth", None, None, d("2017-03-22"), "observed",
      [R(k, 1, "Date of Birth: 2017-03-22") for k in range(1, 6)])
    C(S, "grade_level", None, None, cd("3"), "observed",
      [R(k, 1, "Grade: 3") for k in range(1, 6)])
    C(S, "school", None, None, e("ent_school"), "observed",
      [R(k, 1, "School: Synthetic Elementary School") for k in range(1, 6)])
    C(S, "district", None, None, e("ent_district"), "observed",
      [R(k, 1, "District: Synthetic District") for k in range(1, 6)])

    # ============================================================ eligibility and need
    C(S, "eligibility_category", None, "eligibility_determination",
      t("Specific Learning Disability (SLD) - Reading"), "decided",
      [R(1, 1, "Eligibility Category: Specific Learning Disability (SLD) - Reading"),
       R(5, 1, "Current educational eligibility remains Specific Learning Disability (SLD) - Reading.")],
      occurredOn=D1)
    C(S, "eligibility_determination_date", None, "eligibility_determination", d(D1), "observed",
      [R(1, 1, "Determination Date: 2025-09-10")])
    C(S, "eligibility_is_medical_diagnosis", None, "eligibility_determination", b(False), "observed",
      [R(1, 1, "This IEP implements the educational eligibility determination. It is not a medical diagnosis.")])
    C(S, "primary_educational_need", None, "eligibility_determination", t("Reading"), "decided",
      [R(1, 1, "Primary Educational Need: Reading"),
       R(1, 1, "The primary educational need is Reading."),
       R(1, 2, "This IEP addresses Reading for Daniel Okafor.")], occurredOn=D1)

    # ============================================================ present levels and need
    C(S, "reading_concern", "reading", "present_levels", t("persistent reading concern"), "observed",
      [R(1, 1, "Daniel has a persistent reading concern.")], occurredOn=D1)
    C(S, "reading_difficulty", "connected_grade_level_text", "classroom_performance",
      t("difficulty reading connected grade-level text with expected fluency"), "observed",
      [R(1, 1, "Classroom performance indicates difficulty reading connected grade-level text with expected fluency."),
       R(1, 1, "Daniel has difficulty reading connected grade-level text with expected fluency.")], occurredOn=D1)
    C(S, "educational_need_impact", "grade_level_reading_activities", None,
      t("affects ability to access grade-level reading activities independently"), "observed",
      [R(1, 1, "This difficulty affects Daniel's ability to access grade-level reading activities independently.")],
      occurredOn=D1)

    # ============================================================ oral reading fluency series
    C(S, "oral_reading_fluency", ORF_TASK, "present_levels_baseline", q(70, "WCPM"), "observed",
      [R(1, 1, "Baseline measured September 10, 2025: Oral Reading Fluency - 70 words correct per minute."),
       R(1, 1, "The present-levels baseline is 70 WCPM."),
       R(1, 1, "This oral reading fluency baseline was measured on 2025-09-10."),
       R(1, 2, "The oral reading fluency baseline is 70 WCPM."),
       R(5, 1, "The 70 WCPM baseline is historical present-level evidence from the September 10, 2025 IEP.")],
      occurredOn=D1)
    for k, (ent, qn, dt, val) in PR.items():
        C(S, "oral_reading_fluency", ORF_TASK, "progress_monitoring", q(val, "WCPM"), "observed",
          [R(k, 1, f"{dt} Oral Reading Fluency {val} WCPM"),
           R(k, 1, f"Assessment Date: {dt}. On that date, Daniel read grade-level connected text at {val} WCPM.")],
          occurredOn=dt)
    C(S, "oral_reading_fluency", ORF_TASK, "academic_evaluation", q(96, "WCPM"), "observed",
      [R(5, 1, "Oral Reading Fluency 96 WCPM"),
       R(5, 1, "The 96 WCPM oral reading fluency result is the current evaluation measurement."),
       R(5, 1, "Academic evaluation documents oral reading fluency of 96 WCPM and reading accuracy of 94 percent on 2026-06-05.")],
      occurredOn=D5)
    C(S, "reading_accuracy", ORF_TASK, "academic_evaluation", q(94, "%"), "observed",
      [R(5, 1, "Reading Accuracy 94%"),
       R(5, 1, "while reading accuracy measured 94%."),
       R(5, 1, "and reading accuracy of 94 percent on 2026-06-05.")],
      occurredOn=D5)

    # ============================================================ annual goal
    C(G, "goal_id", None, None, cd("GOAL_READING_FLUENCY"), "observed",
      [R(k, 1, "Goal ID: GOAL_READING_FLUENCY") for k in (1, 2, 3, 4)])
    C(G, "goal_area", None, None, t("reading"), "observed", [R(k, 1, "Area: reading") for k in (2, 3, 4)])
    C(G, "goal_condition", None, None, t("when given a grade-level oral reading passage, by the annual review date"),
      "planned",
      [R(k, 1, "By the annual review date, when given a grade-level oral reading passage,") for k in (1, 2, 3, 4)],
      period=GOAL_PERIOD)
    C(G, "goal_target", "oral_reading_fluency", None, q(95, "WCPM"), "planned",
      [R(1, 1, "Daniel will read 95 words correct per minute. Goal ID:"),
       R(1, 1, "Target: 95 WCPM Start Date:"),
       R(1, 2, "The annual target is 95 WCPM.")]
      + [R(k, 1, "Annual Target: 95 WCPM") for k in (2, 3, 4)],
      period=GOAL_PERIOD)
    C(G, "goal_target_is_measured_result", "oral_reading_fluency", None, b(False), "observed",
      [R(1, 1, "The annual target of 95 WCPM is a goal reference. It is not a measured oral reading fluency result.")])
    C(G, "goal_baseline", "oral_reading_fluency", None, q(70, "WCPM"), "observed",
      [R(1, 1, "Baseline: 70 WCPM")], occurredOn=D1)
    C(G, "goal_start_date", None, None, d("2025-09-10"), "planned",
      [R(1, 1, "Start Date: 2025-09-10 Target Date:")]
      + [R(k, 1, "Goal Start Date: 2025-09-10") for k in (2, 3, 4)])
    C(G, "goal_target_date", None, None, d("2026-09-09"), "planned",
      [R(1, 1, "Target Date: 2026-09-09 The annual target")]
      + [R(k, 1, "Goal Target Date: 2026-09-09") for k in (2, 3, 4)])
    C(G, "progress_measurement_method", None, None, t("curriculum-based oral reading fluency probes"), "planned",
      [R(1, 2, "Progress toward the annual goal will be measured using curriculum-based oral reading fluency probes")],
      period=GOAL_PERIOD)
    C(G, "progress_reporting_frequency", None, None, t("at least quarterly, concurrent with report periods"), "planned",
      [R(1, 2, "reported at least quarterly, concurrent with report periods.")], period=IEP_PERIOD)

    # ============================================================ 01 annual IEP (2025-09-10)
    C(I1, "iep_date", None, None, d(D1), "observed",
      [R(1, 1, "IEP Date: 2025-09-10"),
       R(1, 2, "District Representative: [Synthetic signature omitted] Date: 2025-09-10")])
    C(I1, "iep_period", None, None, per("2025-09-10", "2026-09-09"), "decided",
      [R(1, 1, "IEP Period Start: 2025-09-10 IEP Period End: 2026-09-09"),
       R(1, 1, "IEP effective period: September 10, 2025 through September 9, 2026.")])
    C(I1, "iep_date_and_baseline_date_recorded_separately", None, None, b(True), "observed",
      [R(1, 1, "The IEP date and the baseline measurement date are recorded separately even though both are 2025-09-10.")])
    C(I1, "annual_goal", None, None, e(G), "decided", [R(1, 1, "Goal ID: GOAL_READING_FLUENCY")], period=IEP_PERIOD)
    C(I1, "service_frequency", SRI, SP, q(4, "sessions/week"), "decided",
      [R(1, 2, "Specialized reading instruction 4 sessions per week"),
       R(1, 2, "Specialized reading instruction is provided 4 sessions per week")], period=SVC_PERIOD)
    C(I1, "service_session_length", SRI, SP, q(30, "minutes"), "decided",
      [R(1, 2, "4 sessions per week 30 minutes per session special education setting 2025-09-10"),
       R(1, 2, "Session length is 30 minutes per session.")], period=SVC_PERIOD)
    C(I1, "session_length_is_service_period", SRI, SP, b(False), "observed",
      [R(1, 2, "Session length is not the overall service period.")])
    C(I1, "service_location", SRI, SP, t("special education setting"), "decided",
      [R(1, 2, "for 30 minutes per session in the special education setting.")], period=SVC_PERIOD)
    C(I1, "service_start_date", SRI, SP, d("2025-09-10"), "decided",
      [R(1, 2, "Service Start Date: 2025-09-10"),
       R(1, 2, "The projected date for the beginning of these services is 2025-09-10.")])
    C(I1, "service_period_end", SRI, SP, d("2026-09-09"), "decided",
      [R(1, 2, "Service Period End: 2026-09-09"),
       R(1, 2, "The IEP/service period continues through 2026-09-09.")])
    C(I1, "extent_of_nonparticipation", SRI, None,
      t("participates with nondisabled peers throughout the school day except during the four weekly 30-minute specialized reading sessions in the special education setting"),
      "decided",
      [R(1, 2, "Daniel will participate with nondisabled peers throughout the school day except during the four weekly 30-minute specialized reading sessions provided in the special education setting.")],
      period=IEP_PERIOD)
    C(I1, "accommodation", "extended_time", None,
      t("1.5x extended time on State and districtwide assessments"), "decided",
      [R(1, 2, "\N{BULLET} Daniel will receive 1.5x extended time on State and districtwide assessments.")], period=IEP_PERIOD)
    C(I1, "assessment_participation", "state_and_districtwide_assessments", None,
      t("participates with the accommodations listed in this IEP"), "decided",
      [R(1, 2, "Daniel will participate in state and districtwide assessments with the accommodations listed in this IEP.")],
      period=IEP_PERIOD)
    C(I1, "iep_team_roles", None, None,
      t("Parent/Guardian; General Education Teacher; Special Education Teacher; District Representative"),
      "observed",
      [R(1, 2, "The following roles participate in development of this IEP."),
       R(1, 2, "Parent/Guardian: [Synthetic signature omitted]"),
       R(1, 2, "General Education Teacher: [Synthetic signature omitted]"),
       R(1, 2, "Special Education Teacher: [Synthetic signature omitted]"),
       R(1, 2, "District Representative: [Synthetic signature omitted]")], occurredOn=D1)

    # ============================================================ 02-04 progress reports
    for k, (ent, qn, dt, val) in PR.items():
        C(ent, "report_date", None, None, d(dt), "observed", [R(k, 1, f"Report Date: {dt}")])
        C(ent, "prepared_by", None, None, t("Special education teacher"), "observed",
          [R(k, 1, "Prepared By: Special education teacher")])
        C(ent, "reporting_period", None, None, t(f"{qn} progress toward current IEP goal"), "observed",
          [R(k, 1, f"Reporting Period: {qn} progress toward current IEP goal")])
        C(ent, "goal_monitored", None, None, e(G), "observed",
          [R(k, 1, "Goal Being Monitored"),
           R(k, 1, "This report records current progress toward the existing annual goal.")])
        C(ent, "goal_target_remains_reference", None, None, b(True), "observed",
          [R(k, 1, "The annual target of 95 WCPM remains the goal reference for this reporting period.")], occurredOn=dt)
        C(ent, "revises_present_levels_or_iep", None, None, b(False), "observed",
          [R(k, 1, "It does not revise present levels, rewrite the IEP,")])
        C(ent, "changes_eligibility_services_or_accommodations", None, None, b(False), "observed",
          [R(k, 1, "or change special education services, accommodations, or eligibility."),
           R(k, 1, "No change to services, accommodations, or eligibility is made in this report.")])
        C(S, "receives_service", SRI, f"current_iep_{qn.lower()}_report", b(True), "observed",
          [R(k, 1, "Daniel Okafor continues to receive specialized reading instruction under the current IEP.")],
          occurredOn=dt)

    # ============================================================ 05 academic evaluation (2026-06-05)
    C(E5, "evaluation_date", None, None, d(D5), "observed",
      [R(5, 1, "Evaluation Date: 2026-06-05"),
       R(5, 1, "This academic evaluation was completed on 2026-06-05")])
    C(E5, "evaluator", None, None, t("Academic evaluator"), "observed", [R(5, 1, "Evaluator: Academic evaluator")])
    C(E5, "evaluation_focus", None, None, t("Reading achievement, fluency, and accuracy"), "observed",
      [R(5, 1, "Focus: Reading achievement, fluency, and accuracy"),
       R(5, 1, "The evaluation examines oral reading fluency and reading accuracy related to the documented reading need.")])
    C(E5, "evaluation_reason", None, None, t("update Daniel's reading achievement"), "observed",
      [R(5, 1, "to update Daniel's reading achievement.")])
    C(E5, "results_limited_to_evaluation_date", None, None, b(True), "observed",
      [R(5, 1, "Results below are limited to information collected on the academic evaluation date.")])
    C(E5, "creates_new_baseline_administration", "oral_reading_fluency", None, b(False), "observed",
      [R(5, 1, "This report does not create a new 70 WCPM administration on the evaluation date.")])
    C(E5, "accuracy_is_oral_reading_fluency_observation", "reading_accuracy", None, b(False), "observed",
      [R(5, 1, "The 94% reading accuracy result is a separate construct from oral reading fluency and is not a words-correct-per-minute score."),
       R(5, 1, "The 94 percent accuracy result is not an oral-reading-fluency observation.")])
    C(E5, "measures_relationship", None, None, t("concurrent measures of different constructs"), "observed",
      [R(5, 1, "These are concurrent measures of different constructs.")])
    C(E5, "continues_series", "oral_reading_fluency", None,
      t("96 WCPM continues the oral-reading-fluency series that began with the 70 WCPM baseline"), "observed",
      [R(5, 1, "The 96 WCPM result continues the oral-reading-fluency series that began with the 70 WCPM baseline.")])
    C(E5, "interpretation", "oral_reading_fluency", None,
      t("fluency rose from a 70 WCPM baseline to 96 WCPM"), "observed",
      [R(5, 1, "Daniel's fluency rose from a 70 WCPM baseline to 96 WCPM,")], occurredOn=D5)
    C(S, "requires_specially_designed_instruction", "reading", "academic_evaluation", b(True), "observed",
      [R(5, 1, "Daniel Okafor continues to require specially designed instruction in reading.")], occurredOn=D5)
    C(E5, "changes_eligibility_services_or_accommodations", None, None, b(False), "observed",
      [R(5, 1, "This report does not change eligibility, IEP services, or accommodations."),
       R(5, 2, "These results are evaluation findings and are not IEP service or eligibility decisions.")])
    C(E5, "recommendations_are_iep_decisions", None, None, b(False), "observed",
      [R(5, 1, "Recommendations in this report are evaluation recommendations and are not IEP decisions.")])
    C(E5, "evaluation_recommendation", SRI, None,
      t("Continue specialized reading instruction under the current IEP"), "observed",
      [R(5, 2, "Continue specialized reading instruction under the current IEP.")], occurredOn=D5)

    # ============================================================ missing information
    GAPS.append({
        "id": "gap_001",
        "description": ("The IEP says progress toward GOAL_READING_FLUENCY will be reported at least "
                        "quarterly, concurrent with report periods, through the IEP period ending "
                        "2026-09-09. Progress reports are supplied for Q1 (2025-11-14), Q2 (2026-02-13) "
                        "and Q3 (2026-05-15). No progress report after 2026-05-15 is supplied, so the "
                        "record has no goal-progress report covering 2026-05-16 to 2026-09-09. A Q4 "
                        "progress report, or a record that none was issued, would answer this."),
        "gapKind": "not_found_in_supplied_documents",
        "subjectEntityId": G,
        "relatedConstruct": "progress_reporting_frequency",
        "evidenceRefs": None,
        "proposalLineage": {"proposalItemId": "gap_001", "studyRunId": "golden-l004"},
    })

    voice = {
        "subject": {"value": None, "from": None, "evidenceRefs": None},
        "eventNoun": {"value": None, "from": None, "evidenceRefs": None},
        "helperNoun": {"value": None, "from": None, "evidenceRefs": None},
        "otherPartyNoun": {"value": None, "from": None, "evidenceRefs": None},
        "subjectName": {"value": "Daniel Okafor", "from": "document",
                        "evidenceRefs": finalize_refs("voice_subject_name",
                                                      [R(1, 1, "Student: Daniel Okafor")])},
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
    json.dump(proposal, open(os.path.join(out, "l004-golden.v4.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    json.dump({"caseId": CASE_ID, "wordLayer": "document-pages (extractNativeWords via ensure-document-pages.ts)",
               "wordRangeStatus": "verified",
               "sourceIds": FILE_OF, "sourceHashes": hash_report, "refs": EVIDENCE_INDEX},
              open(os.path.join(out, "l004-golden.evidence-index.json"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    mods = {}
    for c in CLAIMS:
        mods[c["modality"]] = mods.get(c["modality"], 0) + 1
    print(f"entities={len(ENTITIES)} claims={len(CLAIMS)} conflicts=0 gaps={len(GAPS)} "
          f"refs={len(EVIDENCE_INDEX)} (all quotes verified, none repeated on its page) modalities={mods}")


if __name__ == "__main__":
    main()
