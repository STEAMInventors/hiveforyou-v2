#!/usr/bin/env python3
"""L003 golden reference builder and provenance checker.

REFERENCE / PROVENANCE MATERIAL ONLY. Not Hive runtime code, not grader code.

Usage:
    python3 -I build_l003_golden.py <corpus dir> <output dir>

<corpus dir> holds the five L003 PDFs, manifest.json (filename + sha256) and
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
  4. Writes l003-golden.v4.json (canonical-study-proposal/4) and
     l003-golden.evidence-index.json.
"""
import hashlib
import json
import os
import re
import sys
import unicodedata

CASE_ID = "l003"

SRC = {1: "l003-src-1", 2: "l003-src-2", 3: "l003-src-3", 4: "l003-src-4", 5: "l003-src-5"}
FILE_OF = {
    "l003-src-1": "01_prior_annual_iep.pdf",
    "l003-src-2": "02_progress_report.pdf",
    "l003-src-3": "03_iep_team_meeting_notes.pdf",
    "l003-src-4": "04_iep_amendment_summary.pdf",
    "l003-src-5": "05_final_amended_iep.pdf",
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
IEP_PERIOD = PERIOD("2025-09-15", "2027-03-24")      # src-1 p1 and src-5 p1 "IEP Period"
GOAL_PERIOD = PERIOD("2025-09-15", "2027-03-24")     # goal Start Date / Target Date
SVC_2025 = PERIOD("2025-09-15", None)                # src-1 p2 projected start; no end stated
SVC_2026 = PERIOD("2026-04-01", "2027-03-24")        # src-5 p2 service start; IEP period end

# Document dates, each stated on the document itself.
D1, D2, D3, D4, D5 = "2025-09-15", "2026-01-23", "2026-03-04", "2026-03-18", "2026-03-25"

SP = "special_education"
SRI = "specialized_reading_instruction"


def build():
    # ============================================================ entities
    ENT("ent_student", "student", "Sofia Martinez",
        [R(1, 1, "Student: Sofia Martinez"), R(1, 1, "Sofia has a persistent reading concern.")],
        aliases=["Sofia"])
    ENT("ent_school", "school", "Synthetic Elementary School",
        [R(1, 1, "School: Synthetic Elementary School")])
    ENT("ent_district", "school_district", "Synthetic District",
        [R(1, 1, "District: Synthetic District")])
    ENT("ent_iep_2025", "iep", "IEP (2025-09-15)",
        [R(1, 1, "Individualized Education Program (IEP)"), R(1, 1, "IEP Date: 2025-09-15")])
    ENT("ent_progress_2026", "progress_report", "IEP Progress Report (2026-01-23)",
        [R(2, 1, "IEP Progress Report SYNTHETIC DEVELOPMENT RECORD"), R(2, 1, "Report Date: 2026-01-23")])
    ENT("ent_meeting_2026", "meeting_notes", "IEP Team Meeting Notes (2026-03-04)",
        [R(3, 1, "IEP Team Meeting Notes SYNTHETIC DEVELOPMENT RECORD"), R(3, 1, "Meeting Date: 2026-03-04")])
    ENT("ent_amendment_summary", "iep_amendment_summary", "IEP Amendment Summary (2026-03-18)",
        [R(4, 1, "IEP Amendment Summary SYNTHETIC DEVELOPMENT RECORD"), R(4, 1, "Document Date: 2026-03-18")])
    ENT("ent_iep_2026", "iep", "Final amended IEP (2026-03-25)",
        [R(5, 1, "Individualized Education Program (IEP)"), R(5, 1, "IEP Date: 2026-03-25"),
         R(5, 1, "Document Type: Final amended IEP")])
    ENT("ent_goal_reading", "annual_goal", "Annual goal GOAL_READING",
        [R(1, 1, "Goal ID: GOAL_READING"), R(2, 1, "Goal ID: GOAL_READING"), R(5, 1, "Goal ID: GOAL_READING")])

    S = "ent_student"
    I1, P2, M3, A4, I2 = "ent_iep_2025", "ent_progress_2026", "ent_meeting_2026", "ent_amendment_summary", "ent_iep_2026"
    G = "ent_goal_reading"

    # ============================================================ student identity
    C(S, "student_name", None, None, t("Sofia Martinez"), "observed",
      [R(k, 1, "Student: Sofia Martinez") for k in range(1, 6)])
    C(S, "date_of_birth", None, None, d("2016-05-14"), "observed",
      [R(k, 1, "Date of Birth: 2016-05-14") for k in range(1, 6)])
    C(S, "grade_level", None, None, cd("4"), "observed",
      [R(k, 1, "Grade: 4") for k in range(1, 6)])
    C(S, "school", None, None, e("ent_school"), "observed",
      [R(k, 1, "School: Synthetic Elementary School") for k in range(1, 6)])
    C(S, "district", None, None, e("ent_district"), "observed",
      [R(k, 1, "District: Synthetic District") for k in range(1, 6)])

    # ============================================================ eligibility and need
    # One determination (2025-09-15). The amended IEP restates it ("remains"); no new determination.
    C(S, "eligibility_category", None, "eligibility_determination",
      t("Specific Learning Disability (SLD) - Reading"), "decided",
      [R(1, 1, "Eligibility Category: Specific Learning Disability (SLD) - Reading"),
       R(1, 2, "Eligibility is Specific Learning Disability (SLD) - Reading."),
       R(5, 1, "Eligibility Category: Specific Learning Disability (SLD) - Reading"),
       R(5, 1, "The eligibility category remains Specific Learning Disability (SLD) - Reading."),
       R(5, 2, "Eligibility remains Specific Learning Disability (SLD) - Reading.")],
      occurredOn=D1)
    C(S, "eligibility_determination_date", None, "eligibility_determination", d(D1), "observed",
      [R(1, 1, "Determination Date: 2025-09-15"), R(5, 1, "Determination Date: 2025-09-15")])
    C(S, "eligibility_is_medical_diagnosis", None, "eligibility_determination", b(False), "observed",
      [R(1, 1, "This IEP implements the educational eligibility determination. It is not a medical diagnosis."),
       R(5, 1, "This IEP implements the educational eligibility determination. It is not a medical diagnosis.")])
    C(S, "primary_educational_need", None, "eligibility_determination", t("Reading"), "decided",
      [R(1, 1, "Primary Educational Need: Reading"),
       R(1, 1, "The primary educational need is Reading."),
       R(1, 2, "This IEP addresses Reading for Sofia Martinez."),
       R(5, 1, "Primary Educational Need: Reading"),
       R(5, 1, "The primary educational need is Reading."),
       R(5, 2, "This amended IEP addresses Reading for Sofia Martinez.")],
      occurredOn=D1)

    # ============================================================ present levels
    C(S, "reading_concern", "reading", "present_levels", t("persistent reading concern"), "observed",
      [R(1, 1, "Sofia has a persistent reading concern."),
       R(5, 1, "Sofia continues to have a persistent reading concern.")], occurredOn=D1)
    C(S, "reading_difficulty", "connected_grade_level_text", "classroom_performance",
      t("difficulty reading connected grade-level text with expected fluency and accuracy"), "observed",
      [R(1, 1, "Classroom performance indicates difficulty reading connected grade-level text with expected fluency and accuracy."),
       R(1, 1, "Sofia has difficulty reading connected grade-level text with expected fluency and accuracy."),
       R(5, 1, "Classroom performance indicates difficulty reading connected grade-level text with expected fluency and accuracy."),
       R(5, 1, "Sofia has difficulty reading connected grade-level text with expected fluency and accuracy.")],
      occurredOn=D1)
    C(S, "isolated_vs_connected_word_reading", "word_reading", "present_levels",
      t("isolated word reading stronger than reading of connected passages"), "observed",
      [R(1, 1, "Isolated word reading is stronger than reading of connected passages.")], occurredOn=D1)
    C(S, "educational_need_impact", "grade_level_reading_activities", None,
      t("affects ability to access grade-level reading activities independently"), "observed",
      [R(1, 1, "This difficulty affects Sofia's ability to access grade-level reading activities independently."),
       R(5, 1, "This difficulty affects Sofia's ability to access grade-level reading activities independently.")],
      occurredOn=D1)

    # ============================================================ annual goal (one goal, unchanged)
    C(G, "goal_id", None, None, cd("GOAL_READING"), "observed",
      [R(1, 1, "Goal ID: GOAL_READING"), R(2, 1, "Goal ID: GOAL_READING"), R(5, 1, "Goal ID: GOAL_READING")])
    C(G, "goal_area", None, None, t("reading"), "observed", [R(2, 1, "Area: reading")])
    C(G, "goal_condition", None, None, t("grade-level connected text passage"), "planned",
      [R(k, 1, "Given a grade-level connected text passage,") for k in (1, 2, 5)], period=GOAL_PERIOD)
    C(G, "goal_target", "word_reading_accuracy", None, q(95, "%"), "planned",
      [R(k, 1, "Sofia will read the passage aloud with at least 95% word-reading accuracy across three consecutive curriculum-based probes.")
       for k in (1, 2, 5)], period=GOAL_PERIOD)
    C(G, "mastery_criterion", None, None, t("across three consecutive probes"), "planned",
      [R(1, 1, "Mastery Criterion: across three consecutive probes"),
       R(5, 1, "Mastery Criterion: across three consecutive probes")], period=GOAL_PERIOD)
    C(G, "goal_start_date", None, None, d("2025-09-15"), "planned",
      [R(1, 1, "Start Date: 2025-09-15 Target Date:"), R(2, 1, "Goal Start Date: 2025-09-15"),
       R(5, 1, "Start Date: 2025-09-15 Target Date:")])
    C(G, "goal_target_date", None, None, d("2027-03-24"), "planned",
      [R(1, 1, "Target Date: 2027-03-24 Progress"), R(2, 1, "Goal Target Date: 2027-03-24"),
       R(5, 1, "Target Date: 2027-03-24 Progress")])
    C(G, "progress_measurement_method", None, None,
      t("curriculum-based oral reading fluency and word-reading accuracy probes"), "planned",
      [R(1, 1, "Progress will be measured using curriculum-based oral reading fluency and word-reading accuracy probes."),
       R(5, 1, "Progress will be measured using curriculum-based oral reading fluency and word-reading accuracy probes.")],
      period=GOAL_PERIOD)
    C(G, "progress_reporting_frequency", None, None,
      t("at least annually, concurrent with report periods"), "planned",
      [R(1, 2, "Progress toward the annual goal will be measured using oral-reading probes and reported at least annually, concurrent with report periods."),
       R(5, 2, "Progress toward the annual goal will be measured using oral-reading probes and reported at least annually, concurrent with report periods.")],
      period=IEP_PERIOD)

    # ============================================================ 01 annual IEP (2025-09-15)
    C(I1, "iep_date", None, None, d(D1), "observed",
      [R(1, 1, "IEP Date: 2025-09-15"),
       R(1, 2, "District Representative: [Synthetic signature omitted] Date: 2025-09-15")])
    C(I1, "document_type", None, None, t("annual IEP"), "observed",
      [R(1, 1, "This annual IEP is written in Grade 4")])
    C(I1, "iep_period", None, None, per("2025-09-15", "2027-03-24"), "decided",
      [R(1, 1, "IEP Period: 2025-09-15 through 2027-03-24"),
       R(1, 1, "remains in effect through the goal target date of 2027-03-24, spanning Grade 4 into Grade 5.")])
    C(I1, "present_levels_report_oral_reading_fluency_score", None, None, b(False), "observed",
      [R(1, 1, "This present-levels description does not report a curriculum-based oral reading fluency score.")])
    C(I1, "annual_goal", None, None, e(G), "decided", [R(1, 1, "Goal ID: GOAL_READING")], period=IEP_PERIOD)
    C(I1, "service_frequency", SRI, SP, q(5, "sessions/week"), "decided",
      [R(1, 1, "Specialized reading instruction 5 sessions per week"),
       R(1, 2, "Specialized reading instruction: 5 sessions per week, 45 minutes per session. Specialized reading instruction is provided"),
       R(3, 1, "The IEP currently in effect provides specialized reading instruction five sessions per week"),
       R(4, 1, "The IEP currently in effect provides specialized reading instruction five sessions per week")],
      period=SVC_2025)
    C(I1, "service_session_length", SRI, SP, q(45, "minutes"), "decided",
      [R(1, 1, "5 sessions per week 45 minutes per session special education setting 2025-09-15"),
       R(3, 1, "five sessions per week for 45 minutes per session in a special education setting"),
       R(4, 1, "five sessions per week for 45 minutes per session to address the documented reading need.")],
      period=SVC_2025)
    C(I1, "service_location", SRI, SP, t("special education setting"), "decided",
      [R(1, 2, "Specialized reading instruction is provided in the special education setting.")], period=SVC_2025)
    C(I1, "service_start_date", SRI, SP, d("2025-09-15"), "decided",
      [R(1, 1, "special education setting 2025-09-15"),
       R(1, 2, "The projected date for the beginning of these services is 2025-09-15.")])
    C(I1, "extent_of_nonparticipation", SRI, None,
      t("does not participate with nondisabled children in the general education classroom during specialized reading instruction; participates with nondisabled peers for the remainder of the school day"),
      "decided",
      [R(1, 2, "Sofia will not participate with nondisabled children in the general education classroom during specialized reading instruction."),
       R(1, 2, "Sofia participates with nondisabled peers for the remainder of the school day.")], period=IEP_PERIOD)
    C(I1, "accommodation", "extended_time", None,
      t("Extended time (1.5x) on classroom and district assessments"), "decided",
      [R(1, 2, "• Extended time (1.5x) on classroom and district assessments.")], period=IEP_PERIOD)
    C(I1, "accommodation", "text_to_speech", None,
      t("Text-to-speech is available for grade-level instructional text"), "decided",
      [R(1, 2, "• Text-to-speech is available for grade-level instructional text.")], period=IEP_PERIOD)
    C(I1, "assessment_participation", "state_and_districtwide_assessments", None,
      t("participates with the accommodations listed in this IEP"), "decided",
      [R(1, 2, "Sofia will participate in state and districtwide assessments with the accommodations listed in this IEP,")],
      period=IEP_PERIOD)
    C(I1, "iep_team_roles", None, None,
      t("Parent/Guardian; General Education Teacher; Special Education Teacher; District Representative"),
      "observed",
      [R(1, 2, "The following roles participate in development of this IEP."),
       R(1, 2, "Parent/Guardian: [Synthetic signature omitted]"),
       R(1, 2, "General Education Teacher: [Synthetic signature omitted]"),
       R(1, 2, "Special Education Teacher: [Synthetic signature omitted]"),
       R(1, 2, "District Representative: [Synthetic signature omitted]")], occurredOn=D1)

    # ============================================================ 02 progress report (2026-01-23)
    C(P2, "report_date", None, None, d(D2), "observed", [R(2, 1, "Report Date: 2026-01-23")])
    C(P2, "prepared_by", None, None, t("Special education teacher"), "observed",
      [R(2, 1, "Prepared By: Special education teacher")])
    C(P2, "reporting_period", None, None, t("Progress toward current IEP goal"), "observed",
      [R(2, 1, "Reporting Period: Progress toward current IEP goal")])
    C(P2, "goal_monitored", None, None, e(G), "observed",
      [R(2, 1, "Goal Being Monitored"),
       R(2, 1, "This report records current progress toward the existing annual goal.")])
    C(S, "oral_reading_fluency", "curriculum_based_oral_reading_fluency_measure", "progress_monitoring",
      q(88, "WCPM"), "observed",
      [R(2, 1, "Oral reading fluency 88 WCPM 2026-01-23"),
       R(2, 1, "On January 23, 2026, Sofia read 88 words correct per minute on the curriculum-based oral reading fluency measure."),
       R(2, 1, "This result of 88 WCPM is a measured curriculum-based oral reading fluency score."),
       R(5, 1, "The January 23 progress report recorded 88 WCPM.")],
      occurredOn=D2)
    C(S, "receives_service", SRI, "current_iep", b(True), "observed",
      [R(2, 1, "Sofia Martinez continues to receive specialized reading instruction under the current IEP.")],
      occurredOn=D2)
    C(P2, "instructional_note", "connected_text_practice", None,
      t("additional practice with connected grade-level text remains part of ongoing instruction"), "observed",
      [R(2, 1, "Additional practice with connected grade-level text remains part of ongoing instruction during the remainder of the goal period.")],
      occurredOn=D2)
    C(P2, "continued_monitoring_method", None, None,
      t("curriculum-based oral reading fluency probes"), "planned",
      [R(2, 1, "Progress will continue to be monitored using curriculum-based oral reading fluency probes.")],
      occurredOn=D2)
    C(P2, "revises_present_levels_or_iep", None, None, b(False), "observed",
      [R(2, 1, "It does not revise present levels, rewrite the IEP,")])
    C(P2, "changes_eligibility_services_or_accommodations", None, None, b(False), "observed",
      [R(2, 1, "or change special education services, accommodations, or eligibility."),
       R(2, 1, "No change to eligibility, services, or accommodations is made in this report.")])

    # ============================================================ 03 meeting notes (2026-03-04)
    C(M3, "meeting_date", None, None, d(D3), "observed",
      [R(3, 1, "Meeting Date: 2026-03-04"),
       R(3, 1, "addresses are recorded in this synthetic record. Date: 2026-03-04")])
    C(M3, "meeting_type", None, None, t("IEP team meeting"), "observed", [R(3, 1, "Meeting Type: IEP team meeting")])
    C(M3, "prepared_by", None, None, t("Special education teacher"), "observed",
      [R(3, 1, "Prepared By: Special education teacher")])
    C(M3, "document_role", None, None,
      t("meeting notes, not an IEP, not an IEP amendment, and not a prior written notice"), "observed",
      [R(3, 1, "They are meeting notes, not an IEP, not an IEP amendment, and not a prior written notice.")])
    C(M3, "team_discussion", "reduce_specialized_reading_frequency", None,
      t("reducing specialized reading instruction from five sessions per week to three sessions per week while maintaining 45-minute sessions"),
      "observed",
      [R(3, 1, "The team discussed reducing specialized reading instruction from five sessions per week to three sessions per week while maintaining 45-minute sessions.")],
      occurredOn=D3)
    C(M3, "team_discussion", "increase_general_education_time", None,
      t("increasing Sofia's time in general education instruction while continuing direct specialized reading instruction"),
      "observed",
      [R(3, 1, "The team discussed increasing Sofia's time in general education instruction while continuing direct specialized reading instruction."),
       R(4, 1, "The team discussed increasing Sofia's time in general education instruction while continuing direct specialized reading instruction.")],
      occurredOn=D3)
    C(M3, "discussion_recorded_as", None, None, t("discussion of a possible IEP amendment"), "observed",
      [R(3, 1, "The team recorded this as a discussion of a possible IEP amendment.")], occurredOn=D3)
    C(M3, "changes_iep", None, None, b(False), "observed",
      [R(3, 1, "No change to the IEP is in effect as of this meeting date."),
       R(3, 1, "The IEP in effect as of this meeting date is unchanged."),
       R(3, 1, "These notes do not amend the IEP.")])
    C(M3, "implements_service_change", None, None, b(False), "observed",
      [R(3, 1, "These notes do not establish a service start date and do not implement a service change."),
       R(3, 1, "The team recorded a discussion only and did not implement a service change.")])
    C(M3, "changes_eligibility_goals_or_accommodations", None, None, b(False), "observed",
      [R(3, 1, "These notes do not change eligibility, annual goals, or accommodations.")])
    C(M3, "service_change_requirement", None, None,
      t("a written IEP amendment and a later operative IEP"), "required",
      [R(3, 1, "Any service change would require a written IEP amendment and a later operative IEP.")])
    C(M3, "participants", None, None,
      t("Parent/guardian; general education teacher; special education teacher; district representative"),
      "observed",
      [R(3, 1, "Parent/guardian, general education teacher, special education teacher, and district representative participated.")],
      occurredOn=D3)

    # ============================================================ 04 amendment summary (2026-03-18)
    C(A4, "document_date", None, None, d(D4), "observed",
      [R(4, 1, "Document Date: 2026-03-18"),
       R(4, 1, "projected date for the beginning of the amended service. Date: 2026-03-18")])
    C(A4, "document_type", None, None, t("IEP amendment summary"), "observed",
      [R(4, 1, "Document Type: IEP amendment summary")])
    C(A4, "amendment_status", None, None, t("Proposed amendment"), "observed",
      [R(4, 1, "Status: Proposed amendment"),
       R(4, 1, "This abbreviated summary records a proposed IEP amendment for Sofia Martinez.")])
    C(A4, "is_final_amended_iep", None, None, b(False), "observed",
      [R(4, 1, "It is not the final amended IEP.")])
    C(A4, "proposed_service_frequency", SRI, SP, q(3, "times/week"), "planned",
      [R(4, 1, "Proposed specialized reading: 3x/week for 45 minutes."),
       R(4, 1, "This document records a proposed service frequency of 3x/week.")], occurredOn=D4)
    C(A4, "proposed_service_session_length", SRI, SP, q(45, "minutes"), "observed",
      [R(4, 1, "Session duration remains 45 minutes.")], occurredOn=D4)
    C(A4, "establishes_service_start_date", None, None, b(False), "observed",
      [R(4, 1, "It does not by itself establish a service start date and is not the final operative service statement."),
       R(4, 1, "This summary does not set the date on which the proposed service begins.")])
    C(A4, "replaces_iep", None, None, b(False), "observed", [R(4, 1, "This summary does not replace the IEP.")])
    C(A4, "changes_eligibility_or_accommodations", None, None, b(False), "observed",
      [R(4, 1, "This summary does not change eligibility or accommodations.")])
    C(A4, "reports_new_oral_reading_fluency_administration", None, None, b(False), "observed",
      [R(4, 1, "This summary does not report a new oral reading fluency administration.")])
    C(A4, "references_document", None, None, e(M3), "observed",
      [R(4, 1, "The IEP team meeting notes record the following discussion, which this summary references without adding further explanation:")])
    C(A4, "next_document_required", None, None,
      t("final amended IEP stating the operative specialized reading service: frequency, session length, location, and projected start date"),
      "required",
      [R(4, 1, "A final amended IEP is required to state the operative specialized reading service, including frequency, session length, location, and the projected date for the beginning of the amended service.")])

    # ============================================================ 05 final amended IEP (2026-03-25)
    C(I2, "iep_date", None, None, d(D5), "observed",
      [R(5, 1, "IEP Date: 2026-03-25"), R(5, 1, "The IEP date is 2026-03-25."),
       R(5, 2, "IEP Date (document date): 2026-03-25"),
       R(5, 2, "District Representative: [Synthetic signature omitted] Date: 2026-03-25")])
    C(I2, "document_type", None, None, t("Final amended IEP"), "observed",
      [R(5, 1, "Document Type: Final amended IEP")])
    C(I2, "iep_period", None, None, per("2025-09-15", "2027-03-24"), "decided",
      [R(5, 1, "IEP Period: 2025-09-15 through 2027-03-24"),
       R(5, 1, "The IEP period continues through the goal target date of 2027-03-24, spanning Grade 4 into Grade 5.")])
    C(I2, "iep_date_is_service_start_date", None, None, b(False), "observed",
      [R(5, 1, "The IEP date is not the service start date.")])
    C(I2, "present_levels_evidence_source", "oral_reading_fluency", None, e(P2), "observed",
      [R(5, 1, "That curriculum-based oral reading fluency result is present-level evidence from the January 23, 2026 progress report.")])
    C(I2, "reports_new_oral_reading_fluency_administration", None, None, b(False), "observed",
      [R(5, 1, "This IEP does not report a new oral reading fluency administration on 2026-03-25.")])
    C(I2, "annual_goal", None, None, e(G), "decided", [R(5, 1, "Goal ID: GOAL_READING")], period=IEP_PERIOD)
    C(I2, "service_frequency", SRI, SP, q(3, "sessions/week"), "decided",
      [R(5, 2, "Specialized reading instruction three sessions each week"),
       R(5, 2, "Specialized reading instruction will be provided three sessions each week for 45 minutes per session beginning April 1, 2026. The projected"),
       R(5, 2, "Anticipated frequency is three sessions each week.")], period=SVC_2026)
    C(I2, "service_session_length", SRI, SP, q(45, "minutes"), "decided",
      [R(5, 2, "three sessions each week 45 minutes per session special education setting 2026-04-01"),
       R(5, 2, "Session duration is 45 minutes per session.")], period=SVC_2026)
    C(I2, "service_location", SRI, SP, t("special education setting"), "decided",
      [R(5, 2, "Location is the special education setting.")], period=SVC_2026)
    C(I2, "service_start_date", SRI, SP, d("2026-04-01"), "decided",
      [R(5, 2, "Service Start Date: 2026-04-01"),
       R(5, 2, "The projected date for the beginning of the amended specialized reading service is 2026-04-01 (April 1, 2026).")])
    C(I2, "extent_of_nonparticipation", SRI, None,
      t("does not participate with nondisabled children in the general education classroom during specialized reading instruction; participates with nondisabled peers for the remainder of the school day"),
      "decided",
      [R(5, 2, "Sofia will not participate with nondisabled children in the general education classroom during specialized reading instruction."),
       R(5, 2, "Sofia participates with nondisabled peers for the remainder of the school day.")], period=IEP_PERIOD)
    C(I2, "accommodation", "extended_time", None,
      t("Extended time (1.5x) on classroom and district assessments"), "decided",
      [R(5, 2, "• Extended time (1.5x) on classroom and district assessments.")], period=IEP_PERIOD)
    C(I2, "accommodation", "text_to_speech", None,
      t("Text-to-speech is available for grade-level instructional text"), "decided",
      [R(5, 2, "• Text-to-speech is available for grade-level instructional text.")], period=IEP_PERIOD)
    C(I2, "assessment_participation", "state_and_districtwide_assessments", None,
      t("participates with the accommodations listed in this IEP"), "decided",
      [R(5, 2, "Sofia will participate in state and districtwide assessments with the accommodations listed in this IEP,")],
      period=IEP_PERIOD)
    C(I2, "iep_team_roles", None, None,
      t("Parent/Guardian; General Education Teacher; Special Education Teacher; District Representative"),
      "observed",
      [R(5, 2, "The following roles participate in development of this IEP."),
       R(5, 2, "Parent/Guardian: [Synthetic signature omitted]"),
       R(5, 2, "General Education Teacher: [Synthetic signature omitted]"),
       R(5, 2, "Special Education Teacher: [Synthetic signature omitted]"),
       R(5, 2, "District Representative: [Synthetic signature omitted]")], occurredOn=D5)

    # ============================================================ missing information
    GAPS.append({
        "id": "gap_001",
        "description": ("GOAL_READING is measured by word-reading accuracy (at least 95% across three "
                        "consecutive curriculum-based probes), and both IEPs say progress will be "
                        "measured with oral reading fluency and word-reading accuracy probes. No "
                        "supplied document reports a word-reading accuracy result: there is no "
                        "baseline, and the only progress result (2026-01-23) is oral reading fluency "
                        "in WCPM. A record of the word-reading accuracy probe results would answer this."),
        "gapKind": "not_found_in_supplied_documents",
        "subjectEntityId": G,
        "relatedConstruct": "word_reading_accuracy",
        "evidenceRefs": None,
        "proposalLineage": {"proposalItemId": "gap_001", "studyRunId": "golden-l003"},
    })

    voice = {
        "subject": {"value": None, "from": None, "evidenceRefs": None},
        "eventNoun": {"value": None, "from": None, "evidenceRefs": None},
        "helperNoun": {"value": None, "from": None, "evidenceRefs": None},
        "otherPartyNoun": {"value": None, "from": None, "evidenceRefs": None},
        "subjectName": {"value": "Sofia Martinez", "from": "document",
                        "evidenceRefs": finalize_refs("voice_subject_name",
                                                      [R(1, 1, "Student: Sofia Martinez")])},
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
    json.dump(proposal, open(os.path.join(out, "l003-golden.v4.json"), "w"), indent=2, ensure_ascii=False)
    json.dump({"caseId": CASE_ID, "wordLayer": "document-pages (extractNativeWords via ensure-document-pages.ts)",
               "wordRangeStatus": "verified",
               "sourceIds": FILE_OF, "sourceHashes": hash_report, "refs": EVIDENCE_INDEX},
              open(os.path.join(out, "l003-golden.evidence-index.json"), "w"), indent=2, ensure_ascii=False)

    mods = {}
    for c in CLAIMS:
        mods[c["modality"]] = mods.get(c["modality"], 0) + 1
    print(f"entities={len(ENTITIES)} claims={len(CLAIMS)} conflicts=0 gaps={len(GAPS)} "
          f"refs={len(EVIDENCE_INDEX)} (all quotes verified, none repeated on its page) modalities={mods}")


if __name__ == "__main__":
    main()
