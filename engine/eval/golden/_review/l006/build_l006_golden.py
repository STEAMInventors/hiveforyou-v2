#!/usr/bin/env python3
"""L006 golden reference builder and provenance checker.

REFERENCE / PROVENANCE MATERIAL ONLY. Not Hive runtime code, not grader code.

Usage:
    python3 -I build_l006_golden.py <corpus dir> <output dir>

<corpus dir> holds the nine L006 PDFs, manifest.json (filename + sha256) and
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
  4. Writes l006-golden.v4.json (canonical-study-proposal/4) and
     l006-golden.evidence-index.json.
"""
import hashlib
import json
import os
import re
import sys
import unicodedata

CASE_ID = "l006"

SRC = {k: f"l006-src-{k}" for k in range(1, 10)}
FILE_OF = {
    "l006-src-1": "01_prior_annual_iep.pdf",
    "l006-src-2": "02_classroom_behavior_tracking.pdf",
    "l006-src-3": "03_behavior_incident_summary.pdf",
    "l006-src-4": "04_functional_behavior_assessment.pdf",
    "l006-src-5": "05_behavior_intervention_plan.pdf",
    "l006-src-6": "06_prior_written_notice.pdf",
    "l006-src-7": "07_iep_amendment.pdf",
    "l006-src-8": "08_behavior_progress_report.pdf",
    "l006-src-9": "09_current_annual_iep.pdf",
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
IEP_2025 = PERIOD("2025-08-18", "2026-08-17")        # src-1 p1 "IEP Period"
IEP_2026 = PERIOD("2026-03-16", "2027-03-15")        # src-9 p1 "IEP Period"
OBS_WINDOW = PERIOD("2025-09-08", "2025-10-03")      # src-2 p1 "Observation Window"
PROGRESS_WINDOW = PERIOD("2025-11-14", "2026-01-30") # src-8 p1 "Reporting Period"
BC_2025 = PERIOD("2025-11-14", None)                 # src-7 p2 "added effective 2025-11-14"; no end stated
GOAL_BEH_AMD = PERIOD("2025-11-14", "2026-08-17")    # src-7 p1 goal Start / Target Date
GOAL_BEH_2026 = PERIOD("2025-11-14", "2027-03-15")   # src-9 p2 goal Start / Target Date
GOAL_READ_2025 = PERIOD("2025-08-18", "2026-08-17")  # src-1 p2 goal Start / Target Date
GOAL_READ_2026 = PERIOD("2025-08-18", "2027-03-15")  # src-9 p2 goal Start / Target Date

# Document dates, each stated on the document itself.
D1, D2, D3, D4, D5 = "2025-08-18", "2025-10-03", "2025-10-07", "2025-10-24", "2025-11-03"
D6, D7, D8, D9 = "2025-11-12", "2025-11-14", "2026-01-30", "2026-03-16"

SP = "special_education"
SRI = "specialized_reading_instruction"
BC = "behavior_consultation"
TR = "task_refusal"            # target behavior
TI = "task_initiation_within_2_minutes"


def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def build():
    # ============================================================ entities
    ENT("ent_student", "student", "Jordan Ellis",
        [R(1, 1, "Student: Jordan Ellis"), R(1, 1, "Jordan has a documented reading comprehension need.")],
        aliases=["Jordan"])
    ENT("ent_school", "school", "Synthetic Middle School", [R(1, 1, "School: Synthetic Middle School")])
    ENT("ent_district", "school_district", "Synthetic District", [R(1, 1, "District: Synthetic District")])
    ENT("ent_iep_2025", "iep", "Annual IEP (2025-08-18)",
        [R(1, 1, "Individualized Education Program (IEP)"), R(1, 1, "IEP Date: 2025-08-18")])
    ENT("ent_tracking_log", "behavior_data_collection", "Classroom Behavior Tracking Log (2025-10-03)",
        [R(2, 1, "Classroom Behavior Tracking Log"), R(2, 1, "Document Date: 2025-10-03")])
    ENT("ent_incident_summary", "behavior_data_summary", "Behavior Incident / Data Summary (2025-10-07)",
        [R(3, 1, "Behavior Incident / Data Summary"), R(3, 1, "Document Date: 2025-10-07")])
    ENT("ent_fba", "functional_behavior_assessment", "Functional Behavior Assessment (2025-10-24)",
        [R(4, 1, "Functional Behavior Assessment SYNTHETIC DEVELOPMENT RECORD"), R(4, 1, "Assessment Date: 2025-10-24")])
    ENT("ent_bip", "behavior_intervention_plan", "Behavior Intervention Plan (2025-11-03)",
        [R(5, 1, "Behavior Intervention Plan SYNTHETIC DEVELOPMENT RECORD"), R(5, 1, "Plan Date: 2025-11-03")])
    ENT("ent_pwn", "prior_written_notice", "Prior Written Notice (2025-11-12)",
        [R(6, 1, "Prior Written Notice SYNTHETIC DEVELOPMENT RECORD"), R(6, 1, "Notice Date: 2025-11-12")])
    ENT("ent_amendment", "iep_amendment", "IEP Amendment (2025-11-14)",
        [R(7, 1, "IEP Amendment SYNTHETIC DEVELOPMENT RECORD"), R(7, 1, "Amendment Date: 2025-11-14")])
    ENT("ent_progress_2026", "progress_report", "Behavior Progress Report (2026-01-30)",
        [R(8, 1, "Behavior Progress Report SYNTHETIC DEVELOPMENT RECORD"), R(8, 1, "Report Date: 2026-01-30")])
    ENT("ent_iep_2026", "iep", "Annual IEP (2026-03-16)",
        [R(9, 1, "Individualized Education Program (IEP)"), R(9, 1, "IEP Date: 2026-03-16")])
    ENT("ent_goal_reading", "annual_goal", "Annual goal GOAL_READING",
        [R(1, 2, "Goal ID: GOAL_READING"), R(9, 2, "Goal ID: GOAL_READING")])
    ENT("ent_goal_behavior", "annual_goal", "Annual goal GOAL_BEHAVIOR",
        [R(7, 1, "Goal ID: GOAL_BEHAVIOR"), R(9, 2, "Goal ID: GOAL_BEHAVIOR")])

    S = "ent_student"
    I1, L2, S3, F4, B5 = "ent_iep_2025", "ent_tracking_log", "ent_incident_summary", "ent_fba", "ent_bip"
    N6, A7, P8, I2 = "ent_pwn", "ent_amendment", "ent_progress_2026", "ent_iep_2026"
    GR, GB = "ent_goal_reading", "ent_goal_behavior"

    # ============================================================ student identity
    C(S, "student_name", None, None, t("Jordan Ellis"), "observed",
      [R(k, 1, "Student: Jordan Ellis") for k in range(1, 10)])
    C(S, "date_of_birth", None, None, d("2013-06-12"), "observed",
      [R(k, 1, "Date of Birth: 2013-06-12") for k in range(1, 10)])
    C(S, "grade_level", None, None, cd("6"), "observed",
      [R(k, 1, "Grade: 6") for k in range(1, 9)], occurredOn=D1)
    C(S, "grade_level", None, None, cd("7"), "observed",
      [R(9, 1, "Grade: 7"), R(9, 1, "This annual IEP for Jordan Ellis is written in Grade 7.")], occurredOn=D9)
    C(S, "school", None, None, e("ent_school"), "observed",
      [R(k, 1, "School: Synthetic Middle School") for k in range(1, 10)])
    C(S, "district", None, None, e("ent_district"), "observed",
      [R(k, 1, "District: Synthetic District") for k in range(1, 10)])

    # ============================================================ eligibility and need (one determination, 2025-08-18)
    C(S, "eligibility_category", None, "eligibility_determination", t("Other Health Impairment"), "decided",
      [R(1, 1, "Eligibility Category: Other Health Impairment"),
       R(1, 1, "Eligibility category: Other Health Impairment."),
       R(1, 3, "Eligibility is Other Health Impairment."),
       R(9, 1, "Eligibility Category: Other Health Impairment"),
       R(9, 1, "Eligibility remains Other Health Impairment."),
       R(9, 4, "Eligibility remains Other Health Impairment.")], occurredOn=D1)
    C(S, "eligibility_determination_date", None, "eligibility_determination", d(D1), "observed",
      [R(1, 1, "Determination Date: 2025-08-18"), R(9, 1, "Determination Date: 2025-08-18")])
    C(S, "eligibility_is_medical_diagnosis", None, "eligibility_determination", b(False), "observed",
      [R(1, 1, "Eligibility category: Other Health Impairment. This is not a medical diagnosis."),
       R(1, 1, "No medical diagnosis is recorded in this IEP."),
       R(9, 1, "Eligibility remains Other Health Impairment. This is not a medical diagnosis.")])
    C(S, "primary_educational_need", None, "eligibility_determination", t("Reading comprehension"), "decided",
      [R(1, 1, "Primary Educational Need: Reading comprehension"),
       R(1, 2, "The primary educational need is Reading comprehension."),
       R(9, 1, "Primary Educational Need: Reading comprehension"),
       R(9, 2, "The primary educational need remains reading comprehension.")], occurredOn=D1)
    C(S, "additional_documented_need", "self_regulation", "annual_iep_2025", b(False), "observed",
      [R(1, 2, "An additional documented need for self-regulation is not identified on this IEP date.")],
      occurredOn=D1)
    C(S, "additional_documented_need", "self_regulation", "annual_iep_2026",
      t("Self-regulation / task engagement"), "decided",
      [R(9, 1, "Additional Documented Need: Self-regulation / task engagement"),
       R(9, 2, "An additional documented need is self-regulation / task engagement during independent written work.")],
      occurredOn=D9)

    # ============================================================ reading present levels (2025)
    C(S, "reading_comprehension_difficulty", "grade_level_connected_text", "present_levels",
      t("difficulty constructing meaning from grade-level connected text during independent reading and written response tasks"),
      "observed",
      [R(1, 1, "Jordan has difficulty constructing meaning from grade-level connected text during independent reading and written response tasks.")],
      occurredOn=D1)
    C(S, "oral_vs_written_response", None, "classroom_performance",
      t("stronger oral participation than independent written response after reading"), "observed",
      [R(1, 1, "Classroom performance shows stronger oral participation than independent written response after reading.")],
      occurredOn=D1)
    C(S, "word_reading_vs_comprehension", None, "present_levels",
      t("isolated word reading stronger than construction of meaning from grade-level connected text"), "observed",
      [R(1, 1, "Isolated word reading is stronger than construction of meaning from grade-level connected text.")],
      occurredOn=D1)
    C(S, "reading_comprehension_accuracy", "grade_level_informational_probes", "present_levels_baseline",
      q(55, "%"), "observed",
      [R(1, 1, "On this IEP date, Jordan's instructional comprehension baseline is 55% accuracy on grade-level informational probes."),
       R(1, 2, "Baseline: 55% accuracy")], occurredOn=D1)
    C(S, "benefits_from", "structured_discussion_before_written_response", "present_levels",
      t("structured discussion before written response"), "observed",
      [R(1, 1, "Jordan benefits from structured discussion before written response.")], occurredOn=D1)
    C(S, "functional_performance", "teacher_directed_and_small_group_instruction", "present_levels",
      t("generally adequate"), "observed",
      [R(1, 1, "Functional performance in the classroom is generally adequate during teacher-directed and small-group instruction.")],
      occurredOn=D1)
    C(S, "requires_specially_designed_instruction", "reading_comprehension", "annual_iep_2025", b(True), "decided",
      [R(1, 2, "Jordan requires specially designed instruction to access grade-level informational text and to produce written responses that demonstrate understanding.")],
      occurredOn=D1)

    # ============================================================ 01 annual IEP (2025-08-18): document-level
    C(I1, "iep_date", None, None, d(D1), "observed",
      [R(1, 1, "IEP Date: 2025-08-18"), R(1, 1, "The IEP date is 2025-08-18."),
       R(1, 3, "District Representative: [Synthetic signature omitted] Date: 2025-08-18")])
    C(I1, "document_type", None, None, t("Annual IEP"), "observed", [R(1, 1, "Document Type: Annual IEP")])
    C(I1, "iep_period", None, None, per("2025-08-18", "2026-08-17"), "decided",
      [R(1, 1, "IEP Period: 2025-08-18 through 2026-08-17"),
       R(1, 1, "remains in effect through 2026-08-17 unless amended.")])
    C(I1, "present_levels_report_behavior_frequency_baseline", None, None, b(False), "observed",
      [R(1, 1, "This present-levels description does not report a behavior-frequency baseline and does not include a Behavior Intervention Plan.")])
    C(I1, "behavior_goal", None, None, b(False), "decided",
      [R(1, 1, "This annual IEP does not identify a formal behavior goal."),
       R(1, 2, "There is no formal behavior goal in this IEP."),
       R(1, 3, "Formal behavior goal: None")], period=IEP_2025)
    C(I1, "behavior_plan", None, None, b(False), "decided",
      [R(1, 1, "Behavior plan: None Behavior consultation: None"),
       R(1, 3, "This section does not create a Behavior Intervention Plan.")], period=IEP_2025)
    C(I1, "includes_behavior_consultation", BC, None, b(False), "decided",
      [R(1, 2, "Behavior consultation: None No behavior-consultation minutes are listed in this IEP.")], period=IEP_2025)
    C(I1, "behavior_supports", "classroom_management", None,
      t("classroom management practices available to all students remain in place"), "observed",
      [R(1, 3, "Classroom management practices available to all students remain in place.")], occurredOn=D1)
    C(I1, "annual_goal", None, None, e(GR), "decided", [R(1, 2, "Goal ID: GOAL_READING")], period=IEP_2025)
    C(I1, "service_frequency", SRI, SP, q(5, "sessions/week"), "decided",
      [R(1, 2, "Specialized reading instruction 5 sessions per week"),
       R(1, 2, "Specialized reading instruction: 5 sessions per week, 45 minutes per session. Specialized")],
      period=IEP_2025)
    C(I1, "service_session_length", SRI, SP, q(45, "minutes"), "decided",
      [R(1, 2, "5 sessions per week 45 minutes per session special education setting 2025-08-18")], period=IEP_2025)
    C(I1, "service_location", SRI, SP, t("special education setting"), "decided",
      [R(1, 2, "Specialized reading instruction is provided in the special education setting.")], period=IEP_2025)
    C(I1, "service_start_date", SRI, SP, d("2025-08-18"), "decided",
      [R(1, 2, "The projected date for the beginning of these services is 2025-08-18.")])
    C(I1, "extent_of_nonparticipation", SRI, None,
      t("does not participate with nondisabled children in the general education classroom during specialized reading instruction; participates with nondisabled peers for the remainder of the school day"),
      "decided",
      [R(1, 2, "Jordan will not participate with nondisabled children in the general education classroom during specialized reading instruction."),
       R(1, 2, "Jordan participates with nondisabled peers for the remainder of the school day.")], period=IEP_2025)
    C(I1, "accommodation", "extended_time", None, t("Extended time (1.5x) on classroom and district assessments"),
      "decided", [R(1, 2, "• Extended time (1.5x) on classroom and district assessments.")], period=IEP_2025)
    C(I1, "accommodation", "preferential_seating", None, t("Preferential seating near the point of instruction"),
      "decided", [R(1, 2, "• Preferential seating near the point of instruction.")], period=IEP_2025)
    C(I1, "includes_behavior_accommodations", None, None, b(False), "decided",
      [R(1, 2, "No behavior-specific accommodations (visual task checklist, assignment chunking, or help/break card) are included in this IEP.")],
      period=IEP_2025)
    C(I1, "assessment_participation", "state_and_districtwide_assessments", None,
      t("participates with the accommodations listed in this IEP, including Extended time (1.5x)"), "decided",
      [R(1, 2, "Jordan will participate in state and districtwide assessments with the accommodations listed in this IEP, including Extended time (1.5x).")],
      period=IEP_2025)
    C(I1, "iep_team_roles", None, None,
      t("Parent/Guardian; General Education Teacher; Special Education Teacher; District Representative"), "observed",
      [R(1, 3, "The following roles participate in development of this IEP."),
       R(1, 3, "Parent/Guardian: [Synthetic signature omitted]"),
       R(1, 3, "General Education Teacher: [Synthetic signature omitted]"),
       R(1, 3, "Special Education Teacher: [Synthetic signature omitted]"),
       R(1, 3, "District Representative: [Synthetic signature omitted]")], occurredOn=D1)

    # ============================================================ GOAL_READING
    C(GR, "goal_id", None, None, cd("GOAL_READING"), "observed",
      [R(1, 2, "Goal ID: GOAL_READING"), R(9, 2, "Goal ID: GOAL_READING")])
    C(GR, "goal_condition", None, None, t("a grade-level informational passage"), "planned",
      [R(1, 2, "5. Annual Goal Given a grade-level informational passage,"),
       R(9, 2, "Reading goal (continued): Given a grade-level informational passage,")], period=GOAL_READ_2025)
    C(GR, "goal_target", "literal_and_inferential_comprehension_questions", None, q(80, "%"), "planned",
      [R(1, 2, "Jordan will answer literal and inferential comprehension questions with at least 80% accuracy on three consecutive curriculum-based probes. Goal ID: GOAL_READING Baseline:"),
       R(9, 2, "Jordan will answer literal and inferential comprehension questions with at least 80% accuracy on three consecutive curriculum-based probes. Goal ID: GOAL_READING Start")],
      period=GOAL_READ_2025)
    C(GR, "goal_baseline", "literal_and_inferential_comprehension_questions", "annual_iep_2025", q(55, "%"), "observed",
      [R(1, 2, "Baseline: 55% accuracy")], occurredOn=D1)
    C(GR, "mastery_criterion", None, None, t("80% accuracy across three consecutive probes"), "planned",
      [R(1, 2, "Mastery Criterion: 80% accuracy across three consecutive probes")], period=GOAL_READ_2025)
    C(GR, "goal_start_date", None, None, d("2025-08-18"), "planned",
      [R(1, 2, "Start Date: 2025-08-18 Target Date: 2026-08-17"),
       R(9, 2, "Start Date: 2025-08-18 Target Date: 2027-03-15")])
    C(GR, "goal_target_date", None, "annual_iep_2025", d("2026-08-17"), "planned",
      [R(1, 2, "Target Date: 2026-08-17 Progress")])
    C(GR, "goal_target_date", None, "annual_iep_2026", d("2027-03-15"), "planned",
      [R(9, 2, "Start Date: 2025-08-18 Target Date: 2027-03-15")])
    C(GR, "goal_continued", None, "annual_iep_2026", b(True), "decided",
      [R(9, 2, "Reading goal (continued):")], period=IEP_2026)
    C(GR, "progress_measurement_method", None, None, t("curriculum-based reading-comprehension probes"), "planned",
      [R(1, 2, "Progress will be measured using curriculum-based reading-comprehension probes"),
       R(1, 3, "Progress toward the annual reading goal will be measured using comprehension probes"),
       R(9, 3, "Progress toward the reading goal will be measured using comprehension probes.")], period=GOAL_READ_2025)
    C(GR, "progress_reporting_frequency", None, "annual_iep_2025",
      t("at least as often as report cards are issued to all students"), "planned",
      [R(1, 3, "reported at least as often as report cards are issued to all students.")], period=IEP_2025)

    # ============================================================ 02 tracking log (2025-10-03)
    C(L2, "document_date", None, None, d(D2), "observed",
      [R(2, 1, "Document Date: 2025-10-03"), R(2, 3, "Log Closed: 2025-10-03")])
    C(L2, "document_type", None, None, t("Classroom behavior tracking / observation"), "observed",
      [R(2, 1, "Document Type: Classroom behavior tracking / observation")])
    C(L2, "observation_window", None, None, per("2025-09-08", "2025-10-03"), "observed",
      [R(2, 1, "Observation Window: 2025-09-08 through 2025-10-03"),
       R(3, 1, "from 2025-09-08 through 2025-10-03."),
       R(4, 1, "• Classroom behavior tracking log dated 2025-09-08 through 2025-10-03")])
    C(L2, "determines_behavior_function", None, None, b(False), "observed",
      [R(2, 1, "It is not a Functional Behavior Assessment conclusion and does not determine the function of behavior.")])
    C(S, "target_behavior", TR, "behavior_data_collection", t("task refusal / disengagement"), "observed",
      [R(2, 1, "Target behavior: task refusal / disengagement."),
       R(3, 1, "The target behavior is task refusal / disengagement."),
       R(4, 1, "The target behavior is task refusal / disengagement."),
       R(5, 1, "Target behavior: task refusal / disengagement.")], occurredOn=D2)
    C(S, "target_behavior_operational_definition", TR, "behavior_data_collection",
      t("after an independent written task is presented, puts materials aside, verbally refuses, puts head down, or leaves the assigned work area for at least 30 seconds without beginning the requested task"),
      "observed",
      [R(2, 1, "After an independent written task is presented, Jordan puts materials aside, verbally refuses, puts head down, or leaves the assigned work area for at least 30 seconds without beginning the requested task."),
       R(3, 1, "After an independent written task is presented, Jordan puts materials aside, verbally refuses, puts head down, or leaves the assigned work area for at least 30 seconds without beginning the requested task."),
       R(4, 1, "After an independent written task is presented, Jordan puts materials aside, verbally refuses, puts head down, or leaves the assigned work area for at least 30 seconds without beginning the requested task.")],
      occurredOn=D2)
    C(S, "target_behavior_exclusions", TR, "behavior_data_collection",
      t("incorrect answers and requests for help are not the target behavior"), "observed",
      [R(2, 1, "Ordinary incorrect answers and asking for help are not coded as task refusal."),
       R(4, 1, "Incorrect answers and requests for help are not treated as the target behavior.")], occurredOn=D2)
    C(L2, "threshold_is_episode_duration", TR, None, b(False), "observed",
      [R(2, 1, "The 30-second operational-definition threshold is a coding cutoff. It does not mean that every episode lasted exactly 30 seconds."),
       R(4, 1, "The 30-second operational-definition threshold is a coding cutoff. It does not mean that observed episodes lasted exactly 30 seconds.")])
    C(S, "task_refusal_episode_count", TR, "classroom_observation", q(17, "episodes"), "observed",
      [R(2, 2, "Total task-refusal episodes: 17 Instructional weeks observed: 4 (four instructional weeks). Average:"),
       R(3, 2, "Total task-refusal episodes 17 Average frequency"),
       R(4, 2, "Total task-refusal episodes 17 Instructional weeks observed")], period=OBS_WINDOW)
    C(L2, "instructional_weeks_observed", None, None, q(4, "instructional weeks"), "observed",
      [R(2, 1, "Instructional Weeks Observed: 4"),
       R(3, 2, "Instructional weeks observed 4 (four instructional weeks) Total"),
       R(4, 2, "Instructional weeks observed 4 (four instructional weeks) Average")])
    C(L2, "observation_window_is_incident_count", None, None, b(False), "observed",
      [R(2, 2, "The four-week observation period is a window, not an incident count.")])
    C(S, "task_refusal_frequency", TR, "classroom_observation_baseline", q(4.25, "episodes/week"), "observed",
      [R(2, 2, "Average: 4.25 episodes per week. The four-week"),
       R(3, 2, "Average frequency 4.25 episodes per week"),
       R(4, 2, "The observational baseline is 4.25 episodes per week across four instructional weeks."),
       R(5, 1, "Observational baseline frequency remains 4.25 episodes per week."),
       R(7, 1, "The baseline of 4.25 episodes per week is the FBA observational baseline."),
       R(8, 1, "FBA / amendment baseline 4.25 episodes per week")],
      period=OBS_WINDOW)
    C(S, "task_refusal_episode_count", "independent_written_language_arts", "classroom_observation", q(13, "episodes"), "observed",
      [R(2, 2, "Thirteen episodes occurred during independent written language arts."),
       R(3, 2, "Independent written language arts 13 episodes"),
       R(4, 2, "Independent written language arts accounted for 13 of 17 episodes.")], period=OBS_WINDOW)
    C(S, "task_refusal_episode_count", "independent_written_social_studies", "classroom_observation", q(3, "episodes"), "observed",
      [R(2, 2, "Three episodes occurred during independent written social studies."),
       R(3, 2, "Independent written social studies 3 episodes"),
       R(4, 2, "Independent written social studies accounted for 3 episodes.")], period=OBS_WINDOW)
    C(S, "task_refusal_episode_count", "independent_science_lab_write_up", "classroom_observation", q(1, "episodes"), "observed",
      [R(2, 2, "One episode occurred during an independent science lab write-up."),
       R(3, 2, "Other (science lab write-up) 1 episode"),
       R(4, 2, "One episode occurred during an independent science lab write-up.")], period=OBS_WINDOW)
    C(S, "task_refusal_observed", "small_group_mathematics", "classroom_observation", b(False), "observed",
      [R(2, 3, "No task-refusal episodes were observed during three small-group mathematics observations."),
       R(3, 2, "Small-group mathematics sample no observed task refusal"),
       R(4, 2, "No task-refusal episodes were observed during three small-group mathematics observations.")],
      period=OBS_WINDOW)
    C(L2, "settings_are_contradictory", None, None, b(False), "observed",
      [R(2, 3, "Difference by setting is a context difference. This log does not treat those settings as contradictory."),
       R(3, 2, "This summary does not treat the settings as a contradiction"),
       R(4, 2, "This is a context difference, not a contradiction.")])

    # ============================================================ 03 incident summary (2025-10-07)
    C(S3, "document_date", None, None, d(D3), "observed",
      [R(3, 1, "Document Date: 2025-10-07"), R(3, 2, "Date: 2025-10-07"), R(4, 1, "• Behavior incident / data summary dated 2025-10-07")])
    C(S3, "prepared_by", None, None, t("Classroom team (synthetic)"), "observed", [R(3, 1, "Prepared By: Classroom team (synthetic)")])
    C(S, "physical_aggression_observed", None, "behavior_incident_summary", b(False), "observed",
      [R(3, 1, "Physical aggression was not observed.")], period=OBS_WINDOW)
    C(S, "suspension_issued", None, "behavior_incident_summary", b(False), "observed",
      [R(3, 1, "Suspension was discussed as an example of a possible administrative response; no suspension was issued during the observation period.")],
      period=OBS_WINDOW)
    C(S3, "reason_for_data_collection", None, None,
      t("Jordan increasingly avoided difficult independent written assignments"), "observed",
      [R(3, 2, "Staff collected data because Jordan increasingly avoided difficult independent written assignments.")],
      occurredOn=D3)
    C(S3, "strongest_association", TR, None, t("independent written tasks"), "observed",
      [R(3, 2, "The strongest association was with independent written tasks.")], occurredOn=D3)
    C(S3, "adult_responses_during_period", None, None, t("prompting, restating the task, and redirection"), "observed",
      [R(3, 2, "Adult responses during the period included prompting, restating the task, and redirection.")], occurredOn=D3)
    C(S3, "task_resumption_outcome", None, None,
      t("resumed the assigned work after some episodes and did not resume after others"), "observed",
      [R(3, 2, "Jordan resumed the assigned work after some episodes and did not resume after others.")], occurredOn=D3)
    C(S3, "states_hypothesized_function", None, None, b(False), "observed",
      [R(3, 2, "• This summary does not state a hypothesized function."),
       R(3, 1, "It does not determine the function of behavior and is not a Functional Behavior Assessment.")])
    C(S3, "creates_bip_or_changes_iep", None, None, b(False), "observed",
      [R(3, 2, "• This summary does not create a Behavior Intervention Plan."),
       R(3, 2, "• This summary does not change the IEP.")])

    # ============================================================ 04 FBA (2025-10-24)
    C(F4, "assessment_date", None, None, d(D4), "observed",
      [R(4, 1, "Assessment Date: 2025-10-24"), R(4, 3, "Date: 2025-10-24"),
       R(5, 1, "Linked Assessment: Functional Behavior Assessment dated 2025-10-24")])
    C(F4, "examiner_role", None, None, t("Evaluator (synthetic)"), "observed", [R(4, 1, "Examiner Role: Evaluator (synthetic)")])
    C(F4, "introduces_medical_diagnosis", None, None, b(False), "observed",
      [R(4, 1, "This report does not introduce a medical diagnosis.")])
    for item in ["• Classroom behavior tracking log dated 2025-09-08 through 2025-10-03",
                 "• Behavior incident / data summary dated 2025-10-07",
                 "• 20 minutes of classroom observation in language arts (not a service)",
                 "• 1:1 observation during independent work time (not a 1:1 instructional service)",
                 "• Teacher interview regarding independent written work"]:
        C(F4, "data_source", slug(item[2:])[:60], None, t(item[2:]), "observed", [R(4, 1, item)], occurredOn=D4)
    C(F4, "observation_interval_is_service", "classroom_observation_20_minutes", None, b(False), "observed",
      [R(4, 1, "20 minutes of classroom observation is a data-collection interval. It is not a 20-minute IEP service.")])
    C(F4, "observation_interval_is_service", "one_to_one_observation", None, b(False), "observed",
      [R(4, 1, "The 1:1 observation is a data-collection arrangement, not a 1:1 instructional service.")])
    C(F4, "antecedent_pattern", TR, None, t("difficult independent written tasks"), "observed",
      [R(4, 2, "Antecedent: The strongest pattern occurred following difficult independent written tasks."),
       R(4, 2, "The record associates the target behavior with independent written tasks.")], occurredOn=D4)
    C(F4, "consequence_pattern", TR, None, t("prompting, restating the task, and redirection; brief delay of the assigned work"), "observed",
      [R(4, 2, "Consequence: Typical adult responses included prompting, restating the task, and redirection."),
       R(4, 2, "A brief delay of the assigned work was a recurring consequence pattern in the observation sample.")],
      occurredOn=D4)
    C(F4, "hypothesized_function", TR, None, t("escape or avoidance of difficult independent written work"), "observed",
      [R(4, 2, "Hypothesized Function Hypothesized function: escape or avoidance of difficult independent written work."),
       R(5, 1, "It responds to the FBA hypothesized function of escape or avoidance of difficult independent written work.")],
      occurredOn=D4)
    C(F4, "function_is_confirmed_fact_or_diagnosis", TR, None, b(False), "observed",
      [R(4, 2, "The hypothesized function is not a confirmed diagnosis and is not a definitively established motivation.")])
    C(F4, "limitation", None, None,
      t("observations concentrated in academic settings; not evidence the pattern occurs in all environments"), "observed",
      [R(4, 3, "Limitations Available observations were concentrated in academic settings and should not be interpreted as demonstrating that the same pattern occurs in all environments.")],
      occurredOn=D4)
    C(F4, "possible_support", "brief_break_on_appropriate_request", None,
      t("a brief break may be useful when Jordan appropriately requests one"), "observed",
      [R(4, 3, "A brief break may be useful when Jordan appropriately requests one.")], occurredOn=D4)
    C(F4, "possible_support_is_iep_accommodation", "brief_break_on_appropriate_request", None, b(False), "observed",
      [R(4, 3, "It is not an IEP accommodation on this assessment date.")])
    C(F4, "changes_iep_provisions", None, None, b(False), "observed",
      [R(4, 3, "This assessment does not recommend a medical evaluation and does not change eligibility, specialized reading, or extended time.")])

    # ============================================================ 05 BIP (2025-11-03)
    C(B5, "plan_date", None, None, d(D5), "observed",
      [R(5, 1, "Plan Date: 2025-11-03"), R(5, 3, "Plan Author: [Synthetic signature omitted] Date: 2025-11-03"),
       R(6, 1, "• Implement the Behavior Intervention Plan dated 2025-11-03.")])
    C(B5, "linked_assessment", None, None, e(F4), "observed",
      [R(5, 1, "Linked Assessment: Functional Behavior Assessment dated 2025-10-24")])
    C(B5, "listing_proves_effectiveness", None, None, b(False), "observed",
      [R(5, 1, "Listing a strategy does not prove that the strategy is effective. This plan is not evidence of student outcome."),
       R(5, 2, "Implementation of this plan is intended; effectiveness is not established by the existence of this document.")])
    for item in ["[X] chunk long written assignments", "[X] provide a visual task checklist",
                 "[X] offer choice between two equivalent task-start options",
                 "[X] pre-correct before independent written assignments"]:
        C(B5, "prevention_strategy", slug(item[4:]), None, t(item[4:]), "planned", [R(5, 1, item)], occurredOn=D5)
    C(B5, "prevention_strategy", "remove_independent_written_work_from_the_curriculum", None, b(False), "observed",
      [R(5, 1, "[ ] remove independent written work from the curriculum")], occurredOn=D5)
    C(B5, "prevention_strategies_are_outcomes", None, None, b(False), "observed",
      [R(5, 1, "These prevention strategies are planned antecedent supports. They are not measured outcomes.")])
    C(B5, "replacement_behavior", None, None,
      t("appropriately request assistance or a brief break instead of refusing or leaving the assigned work area"), "planned",
      [R(5, 1, "Jordan will appropriately request assistance or a brief break instead of refusing or leaving the assigned work area.")],
      occurredOn=D5)
    C(B5, "replacement_behavior_tool", None, None, t("help/break card"), "planned",
      [R(5, 1, "Replacement behavior tool: help/break card.")], occurredOn=D5)
    C(B5, "help_break_card_is_service_minutes", None, None, b(False), "observed",
      [R(5, 1, "The help/break card is a communication tool. It is not service minutes and is not a related-service allocation."),
       R(5, 2, "The help/break card remains a tool, not service minutes.")])
    for item in ["• Teach Jordan when and how to present the help/break card.",
                 "• Model a brief, appropriate help request before independent written work.",
                 "• Practice the replacement behavior during non-crisis instructional times."]:
        C(B5, "teaching_strategy", slug(item[2:])[:50], None, t(item[2:-1]), "planned", [R(5, 2, item)], occurredOn=D5)
    C(B5, "reinforcement", None, None,
      t("specific positive feedback for task initiation and appropriate help/break requests"), "planned",
      [R(5, 2, "Reinforcement specific positive feedback for task initiation and appropriate help/break requests")], occurredOn=D5)
    C(B5, "reinforcement_has_changed_behavior", None, None, b(False), "observed",
      [R(5, 2, "This plan does not report that reinforcement has already changed behavior.")])
    for item in ["[X] brief neutral redirection", "[X] review task checklist", "[X] prompt replacement behavior",
                 "[X] avoid extended verbal negotiation"]:
        C(B5, "adult_response", slug(item[4:]), None, t(item[4:]), "planned", [R(5, 2, item)], occurredOn=D5)
    C(S, "task_initiation", TI, "bip_baseline", t("approximately 52%"), "observed",
      [R(5, 2, "Task-initiation baseline is approximately 52%."),
       R(8, 1, "BIP baseline approximately 52% percent")], occurredOn=D5)
    C(B5, "measures_are_separate_constructs", None, None, b(True), "observed",
      [R(5, 2, "Measure A and Measure B are separate constructs. They must not be merged into one numeric series."),
       R(5, 2, "This percentage is not the same measurement as 4.25 episodes per week.")])
    C(B5, "review_schedule", None, None, t("at least once each grading period and at the next IEP meeting"), "planned",
      [R(5, 2, "Progress will be reviewed at least once each grading period and at the next IEP meeting.")], occurredOn=D5)
    C(B5, "staff_responsibility", "special_education_teacher", None,
      t("teach the replacement help/break request and provide the visual task checklist before independent written assignments"),
      "planned",
      [R(5, 2, "The special education teacher will teach the replacement help/break request and will provide the visual task checklist before independent written assignments.")],
      occurredOn=D5)
    C(B5, "staff_responsibility", "general_education_teacher", None, t("pre-correct and use brief neutral redirection"), "planned",
      [R(5, 2, "The general education teacher will pre-correct and will use brief neutral redirection.")], occurredOn=D5)
    C(B5, "changes_iep_provisions", None, None, b(False), "observed",
      [R(5, 3, "This plan does not change eligibility, specialized reading frequency, specialized reading session length, or extended time.")])

    # ============================================================ 06 PWN (2025-11-12)
    C(N6, "notice_date", None, None, d(D6), "observed",
      [R(6, 1, "Notice Date: 2025-11-12"), R(6, 1, "District Representative: [Synthetic signature omitted] Date: 2025-11-12")])
    C(N6, "action", None, None, t("Proposed IEP amendment and BIP implementation"), "observed",
      [R(6, 1, "Action: Proposed IEP amendment and BIP implementation")], occurredOn=D6)
    for item, task in [("• Implement the Behavior Intervention Plan dated 2025-11-03.", "implement_bip"),
                       ("• Amend selected IEP sections only.", "amend_selected_iep_sections"),
                       ("• Add behavior-related supports: visual task checklist, assignment chunking, and access to a help/break card.", "add_behavior_supports"),
                       ("• Add behavior consultation. Behavior consultation: 1 session per week, 20 minutes per session.", "add_behavior_consultation")]:
        C(N6, "proposed_action", task, None, t(item[2:]), "observed", [R(6, 1, item)], occurredOn=D6)
    C(N6, "proposal_rationale", None, None,
      t("observational data, the FBA hypothesis, and the BIP support adding selected behavior supports without changing eligibility, specialized reading, or extended time"),
      "observed",
      [R(6, 1, "Observational data, the Functional Behavior Assessment hypothesis, and the Behavior Intervention Plan support adding selected behavior supports without changing eligibility, specialized reading, or extended time.")],
      occurredOn=D6)
    C(N6, "option_considered_not_selected", "continue_without_formal_behavior_plan", None,
      t("continuing without a formal behavior plan; not selected because observational data showed recurring task refusal during independent written work"),
      "observed",
      [R(6, 1, "The team considered continuing without a formal behavior plan."),
       R(6, 1, "That option was not selected because observational data showed recurring task refusal during independent written work.")],
      occurredOn=D6)
    C(N6, "proposes_change", "eligibility_specialized_reading_extended_time", None, b(False), "observed",
      [R(6, 1, "Eligibility, specialized reading instruction, and extended time are not proposed for change."),
       R(6, 1, "• This notice does not remove specialized reading or extended time.")])
    C(N6, "is_iep_amendment", None, None, b(False), "observed",
      [R(6, 1, "• This notice is not the IEP amendment."),
       R(6, 1, "It is not the amended IEP itself and does not replace the IEP.")])
    C(N6, "reports_bip_success", None, None, b(False), "observed",
      [R(6, 1, "• This notice does not report that the BIP has already succeeded.")])

    # ============================================================ 07 amendment (2025-11-14)
    C(A7, "amendment_date", None, None, d(D7), "observed",
      [R(7, 1, "Amendment Date: 2025-11-14"), R(7, 2, "District Representative: [Synthetic signature omitted] Date: 2025-11-14")])
    C(A7, "iep_amended", None, None, e(I1), "observed", [R(7, 1, "IEP Being Amended: Annual IEP dated 2025-08-18")])
    C(A7, "amendment_scope", None, None, t("partial amendment; not a complete replacement IEP"), "observed",
      [R(7, 1, "This document is a partial amendment for Jordan Ellis. It is not a complete replacement IEP.")])
    C(A7, "sections_amended", None, None,
      t("Annual Goal (behavior goal added), Accommodations / Supports (behavior supports added), and Special Education Services / Supports (behavior consultation added)"),
      "observed",
      [R(7, 1, "The sections amended by this document are: Annual Goal (behavior goal added), Accommodations / Supports (behavior supports added), and Special Education Services / Supports (behavior consultation added).")])
    C(A7, "unreproduced_provisions_remain_in_effect", None, None, b(True), "decided",
      [R(7, 1, "Unchanged provisions of the existing IEP remain in effect even though they are not restated here."),
       R(7, 2, "Eligibility, specialized reading instruction, and extended time are not reproduced in this partial amendment. Those provisions remain in effect."),
       R(7, 2, "Absence of those sections from this document is not a removal, discontinuation, or missing-field finding.")],
      occurredOn=D7)
    C(A7, "annual_goal", None, None, e(GB), "decided", [R(7, 1, "Goal ID: GOAL_BEHAVIOR")], period=GOAL_BEH_AMD)
    for item in ["• visual task checklist", "• assignment chunking for extended independent written tasks", "• access to help/break card"]:
        C(A7, "accommodation", slug(item[2:]), None, t(item[2:]), "decided",
          [R(7, 2, f"{item} " + {"• visual task checklist": "• assignment",
                                 "• assignment chunking for extended independent written tasks": "• access",
                                 "• access to help/break card": "These supports"}[item])],
          period=PERIOD("2025-11-14", None))
    C(A7, "supports_replace_existing_accommodations", None, None, b(False), "observed",
      [R(7, 2, "These supports are added to the existing IEP. They do not replace accommodations that remain in effect without being restated.")])
    C(A7, "service_frequency", BC, SP, q(1, "sessions/week"), "decided",
      [R(7, 2, "Behavior consultation 1 session per week"),
       R(7, 2, "Jordan will receive 1 session per week for 20 minutes.")], period=BC_2025)
    C(A7, "service_session_length", BC, SP, q(20, "minutes"), "decided",
      [R(7, 2, "1 session per week 20 minutes per session special education setting 2025-11-14")], period=BC_2025)
    C(A7, "service_location", BC, SP, t("special education setting"), "decided",
      [R(7, 2, "20 minutes per session special education setting 2025-11-14")], period=BC_2025)
    C(A7, "service_start_date", BC, SP, d("2025-11-14"), "decided",
      [R(7, 2, "Behavior consultation is added effective 2025-11-14.")])

    # ============================================================ GOAL_BEHAVIOR
    C(GB, "goal_id", None, None, cd("GOAL_BEHAVIOR"), "observed",
      [R(7, 1, "Goal ID: GOAL_BEHAVIOR"), R(9, 2, "Goal ID: GOAL_BEHAVIOR")])
    C(GB, "goal_target", "task_refusal_frequency", None, t("1 or fewer episodes per instructional week"), "planned",
      [R(7, 1, "Jordan will reduce task-refusal behavior to 1 or fewer episodes per instructional week for four consecutive instructional weeks."),
       R(7, 1, "Target: 1 or fewer episodes per instructional week"),
       R(8, 1, "IEP Behavior Goal Jordan will reduce task-refusal behavior to 1 or fewer episodes per instructional week for four consecutive instructional weeks."),
       R(8, 1, "Goal target: 1 or fewer episodes per instructional week"),
       R(9, 2, "Behavior goal (continued): Jordan will reduce task-refusal behavior to 1 or fewer episodes per instructional week for four consecutive instructional weeks."),
       R(9, 2, "Target: 1 or fewer episodes per instructional week")], period=GOAL_BEH_AMD)
    C(GB, "goal_target_is_current_performance", None, None, b(False), "observed",
      [R(7, 1, "The target of 1 or fewer episodes per week is a goal statement. It is not a statement of current performance.")])
    C(GB, "mastery_criterion", None, None, t("four consecutive instructional weeks"), "planned",
      [R(7, 1, "Mastery Criterion: four consecutive instructional weeks"),
       R(8, 1, "Mastery criterion: four consecutive instructional weeks"),
       R(9, 2, "Mastery Criterion: four consecutive instructional weeks")], period=GOAL_BEH_AMD)
    C(GB, "goal_baseline", "task_refusal_frequency", "iep_amendment_2025", q(4.25, "episodes/week"), "observed",
      [R(7, 1, "Baseline: 4.25 episodes per week"), R(8, 1, "Goal baseline (historical): 4.25 episodes per week")],
      period=GOAL_BEH_AMD)
    C(GB, "goal_baseline", "task_refusal_frequency", "annual_iep_2026", q(2.0, "episodes/week"), "observed",
      [R(9, 2, "Updated baseline: 2.0 episodes per week"),
       R(9, 1, "The updated behavior baseline is 2.0 episodes per week. That value"),
       R(9, 1, "That value supersedes the earlier FBA/amendment baseline of 4.25 episodes per week for the new goal period while retaining the historical sequence.")],
      period=GOAL_BEH_2026)
    C(GB, "goal_start_date", None, None, d("2025-11-14"), "planned",
      [R(7, 1, "Start Date: 2025-11-14"), R(9, 2, "Start Date: 2025-11-14")])
    C(GB, "goal_target_date", None, "iep_amendment_2025", d("2026-08-17"), "planned", [R(7, 1, "Target Date: 2026-08-17")])
    C(GB, "goal_target_date", None, "annual_iep_2026", d("2027-03-15"), "planned",
      [R(9, 2, "Start Date: 2025-11-14 Target Date: 2027-03-15")])
    C(GB, "goal_continued", None, "annual_iep_2026", b(True), "decided",
      [R(9, 2, "Behavior goal (continued):"),
       R(9, 2, "The behavior goal remains Jordan will reduce task-refusal behavior")], period=IEP_2026)
    C(GB, "progress_measurement_method", None, None,
      t("task-refusal episodes per instructional week, kept separate from task initiation percentage"), "planned",
      [R(9, 3, "Progress toward the behavior goal will be measured using task-refusal episodes per instructional week, kept separate from task initiation percentage.")],
      period=IEP_2026)

    # ============================================================ 08 behavior progress report (2026-01-30)
    C(P8, "report_date", None, None, d(D8), "observed", [R(8, 1, "Report Date: 2026-01-30"), R(8, 2, "Date: 2026-01-30")])
    C(P8, "reporting_period", None, None, per("2025-11-14", "2026-01-30"), "observed",
      [R(8, 1, "Reporting Period: 2025-11-14 through 2026-01-30")])
    C(P8, "goal_monitored", None, None, e(GB), "observed", [R(8, 1, "IEP Behavior Goal Jordan will reduce")])
    C(S, "task_refusal_frequency", TR, "progress_monitoring", q(2.0, "episodes/week"), "observed",
      [R(8, 1, "Current progress 2.0 episodes per week"),
       R(8, 1, "Task-refusal frequency is 2.0 episodes per week."),
       R(9, 1, "The January 30, 2026 progress report recorded 2.0 episodes per week.")],
      occurredOn=D8, period=PROGRESS_WINDOW)
    C(S, "task_initiation", TI, "progress_monitoring", q(78, "%"), "observed",
      [R(8, 1, "Current progress 78% percent"),
       R(8, 1, "Task initiation within 2 minutes is 78%."),
       R(9, 1, "Task initiation within 2 minutes was 78% on the January 30 progress report.")],
      occurredOn=D8, period=PROGRESS_WINDOW)
    C(P8, "frequency_change_is_contradiction", None, None, b(False), "observed",
      [R(8, 1, "Compared with the earlier baseline of 4.25 episodes per week, this is chronological progress. These two values are not contradictory.")])
    C(P8, "progress_interpretation", None, None, t("improvement documented on both measures"), "observed",
      [R(8, 2, "Improvement documented on both measures."),
       R(8, 2, "Improvement is documented; the target has not been reached.")], occurredOn=D8)
    C(GB, "goal_target_met", None, "progress_monitoring", b(False), "observed",
      [R(8, 2, "Status: goal criterion not yet demonstrated."),
       R(8, 2, "Jordan has not met the goal.")], occurredOn=D8)
    C(P8, "labels_result_as_failure", None, None, b(False), "observed",
      [R(8, 2, "This report does not label the result as failure and does not describe a legal problem.")])
    C(P8, "staff_implementation_fidelity", None, "sampled_sessions", q(85, "%"), "observed",
      [R(8, 2, "During sampled sessions, staff implementation fidelity = 85%.")], occurredOn=D8)
    C(P8, "fidelity_is_student_performance", None, None, b(False), "observed",
      [R(8, 2, "Staff implementation fidelity is not student performance. 85% is not a student score.")])
    C(P8, "measures_form_one_series", None, None, b(False), "observed",
      [R(8, 1, "They are unlike measurements and are not one numeric sequence."),
       R(8, 2, "Do not combine 4.25 episodes per week, 52%, 2.0 episodes per week, and 78% into one series.")])

    # ============================================================ 09 current annual IEP (2026-03-16)
    C(I2, "iep_date", None, None, d(D9), "observed",
      [R(9, 1, "IEP Date: 2026-03-16"), R(9, 3, "District Representative: [Synthetic signature omitted] Date: 2026-03-16")])
    C(I2, "document_type", None, None, t("Annual IEP"), "observed", [R(9, 1, "Document Type: Annual IEP")])
    C(I2, "iep_period", None, None, per("2026-03-16", "2027-03-15"), "decided",
      [R(9, 1, "IEP Period: 2026-03-16 through 2027-03-15")])
    C(I2, "supersedes", "annual_iep_2025", None, e(I1), "observed",
      [R(9, 1, "This document supersedes the prior annual IEP dated 2025-08-18 and the IEP amendment dated 2025-11-14 as the latest complete IEP state.")])
    C(I2, "supersedes", "iep_amendment_2025", None, e(A7), "observed",
      [R(9, 1, "It consolidates the current state after the November 14, 2025 partial amendment.")])
    C(I2, "eligibility_unchanged", None, None, b(True), "observed",
      [R(9, 1, "Eligibility is unchanged from the prior annual IEP.")])
    C(I2, "creates_new_measurement_event", None, None, b(False), "observed",
      [R(9, 1, "This IEP does not create a new measurement event on the IEP date.")])
    C(I2, "task_initiation_separate_construct", None, None, b(True), "observed",
      [R(9, 1, "Task initiation remains a separate construct from task-refusal frequency.")])
    C(I2, "updated_baseline_means_goal_met", None, None, b(False), "observed",
      [R(9, 2, "The updated baseline of 2.0 episodes per week does not mean the goal has been met.")])
    C(S, "reading_comprehension_need", None, "present_levels_2026",
      t("continues to have a documented reading comprehension need; classroom comprehension remains an instructional focus"),
      "observed",
      [R(9, 1, "Jordan continues to have a documented reading comprehension need."),
       R(9, 1, "Classroom comprehension remains an instructional focus.")], occurredOn=D9)
    C(S, "requires_specially_designed_instruction", "reading_comprehension_and_behavior_supports", "annual_iep_2026",
      b(True), "decided",
      [R(9, 2, "Jordan continues to require specially designed instruction and the behavior supports introduced in the November amendment.")],
      occurredOn=D9)
    C(I2, "behavior_plan", None, None, e(B5), "decided",
      [R(9, 1, "The Behavior Intervention Plan dated 2025-11-03 remains a current support."),
       R(9, 3, "10. Behavior Supports The Behavior Intervention Plan dated 2025-11-03 remains a current support.")],
      period=IEP_2026)
    C(I2, "bip_is_service_minutes", None, None, b(False), "observed",
      [R(9, 3, "The Behavior Intervention Plan is referenced as a current support and is not itself a service-minute allocation.")])
    C(I2, "bip_components_continue", None, None,
      t("prevention strategies, the replacement help/break request, and adult-response procedures continue unless the team revises the plan"),
      "decided",
      [R(9, 3, "Prevention strategies, the replacement help/break request, and adult-response procedures continue unless the team revises the plan.")],
      period=IEP_2026)
    C(I2, "annual_goal", "reading", None, e(GR), "decided", [R(9, 2, "Goal ID: GOAL_READING")], period=IEP_2026)
    C(I2, "annual_goal", "behavior", None, e(GB), "decided", [R(9, 2, "Goal ID: GOAL_BEHAVIOR")], period=IEP_2026)
    C(I2, "service_frequency", SRI, SP, q(5, "sessions/week"), "decided",
      [R(9, 2, "Specialized reading instruction 5 sessions per week"),
       R(9, 2, "Specialized reading instruction: 5 sessions per week, 45 minutes per session. Specialized reading continues"),
       R(9, 2, "Specialized reading continues unchanged from the prior annual IEP.")], period=IEP_2026)
    C(I2, "service_session_length", SRI, SP, q(45, "minutes"), "decided",
      [R(9, 2, "5 sessions per week 45 minutes per session special education setting 2025-08-18")], period=IEP_2026)
    C(I2, "service_location", SRI, SP, t("special education setting"), "decided",
      [R(9, 2, "45 minutes per session special education setting 2025-08-18 Behavior")], period=IEP_2026)
    C(I2, "service_start_date", SRI, SP, d("2025-08-18"), "observed",
      [R(9, 2, "special education setting 2025-08-18 Behavior consultation")])
    C(I2, "service_frequency", BC, SP, q(1, "sessions/week"), "decided",
      [R(9, 2, "Behavior consultation 1 session per week"),
       R(9, 3, "Behavior consultation continues as introduced in the November 14 amendment.")], period=IEP_2026)
    C(I2, "service_session_length", BC, SP, q(20, "minutes"), "decided",
      [R(9, 2, "1 session per week 20 minutes per session special education setting 2025-11-14")], period=IEP_2026)
    C(I2, "service_location", BC, SP, t("special education setting"), "decided",
      [R(9, 2, "20 minutes per session special education setting 2025-11-14")], period=IEP_2026)
    C(I2, "service_start_date", BC, SP, d("2025-11-14"), "observed",
      [R(9, 2, "special education setting 2025-11-14 Specialized")])
    C(I2, "extent_of_nonparticipation", None, None,
      t("does not participate with nondisabled children in the general education classroom during specialized reading instruction and during behavior-consultation sessions; participates with nondisabled peers for the remainder of the school day"),
      "decided",
      [R(9, 3, "Jordan will not participate with nondisabled children in the general education classroom during specialized reading instruction and during behavior-consultation sessions."),
       R(9, 3, "Jordan participates with nondisabled peers for the remainder of the school day.")], period=IEP_2026)
    for item, nxt in [("• Extended time (1.5x) on classroom and district assessments.", "• Preferential"),
                      ("• Preferential seating near the point of instruction.", "• visual"),
                      ("• visual task checklist", "• assignment"),
                      ("• assignment chunking for extended independent written tasks", "• access"),
                      ("• access to help/break card", "Jordan will")]:
        label = item[2:].rstrip(".")
        C(I2, "accommodation", slug(label)[:50], None, t(label), "decided", [R(9, 3, f"{item} {nxt}")], period=IEP_2026)
    C(I2, "accommodations_continue", None, None, t("extended time continues unchanged; behavior accommodations introduced in the amendment continue"),
      "observed",
      [R(9, 3, "Extended time continues unchanged. Behavior accommodations introduced in the amendment continue.")], occurredOn=D9)
    C(I2, "assessment_participation", "state_and_districtwide_assessments", None,
      t("participates with the accommodations listed in this IEP, including Extended time (1.5x)"), "decided",
      [R(9, 3, "Jordan will participate in state and districtwide assessments with the accommodations listed in this IEP, including Extended time (1.5x).")],
      period=IEP_2026)
    C(I2, "progress_reporting_frequency", None, None, t("concurrent with report periods"), "planned",
      [R(9, 3, "Progress will be reported concurrent with report periods.")], period=IEP_2026)
    C(I2, "iep_team_roles", None, None,
      t("Parent/Guardian; General Education Teacher; Special Education Teacher; District Representative"), "observed",
      [R(9, 3, "The following roles participate in development of this IEP."),
       R(9, 3, "Parent/Guardian: [Synthetic signature omitted]"),
       R(9, 3, "General Education Teacher: [Synthetic signature omitted]"),
       R(9, 3, "Special Education Teacher: [Synthetic signature omitted]"),
       R(9, 3, "District Representative: [Synthetic signature omitted]")], occurredOn=D9)

    # ============================================================ missing information
    GAPS.append({
        "id": "gap_001",
        "description": ("GOAL_READING was set on 2025-08-18 with a 55% baseline, and the 2025 IEP says "
                        "progress will be measured with comprehension probes and reported at least as "
                        "often as report cards are issued. The 2026-03-16 IEP continues the goal and "
                        "says classroom comprehension remains an instructional focus, but no supplied "
                        "document reports any reading-comprehension probe result after the 55% baseline. "
                        "The only progress report supplied covers the behavior goal. A reading progress "
                        "report for 2025-08-18 to 2026-03-16 would answer this."),
        "gapKind": "not_found_in_supplied_documents",
        "subjectEntityId": GR,
        "relatedConstruct": "progress_reporting_frequency",
        "evidenceRefs": None,
        "proposalLineage": {"proposalItemId": "gap_001", "studyRunId": "golden-l006"},
    })

    voice = {
        "subject": {"value": None, "from": None, "evidenceRefs": None},
        "eventNoun": {"value": None, "from": None, "evidenceRefs": None},
        "helperNoun": {"value": None, "from": None, "evidenceRefs": None},
        "otherPartyNoun": {"value": None, "from": None, "evidenceRefs": None},
        "subjectName": {"value": "Jordan Ellis", "from": "document",
                        "evidenceRefs": finalize_refs("voice_subject_name",
                                                      [R(1, 1, "Student: Jordan Ellis")])},
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
    json.dump(proposal, open(os.path.join(out, "l006-golden.v4.json"), "w"), indent=2, ensure_ascii=False)
    json.dump({"caseId": CASE_ID, "wordLayer": "document-pages (extractNativeWords via ensure-document-pages.ts)",
               "wordRangeStatus": "verified",
               "sourceIds": FILE_OF, "sourceHashes": hash_report, "refs": EVIDENCE_INDEX},
              open(os.path.join(out, "l006-golden.evidence-index.json"), "w"), indent=2, ensure_ascii=False)

    mods = {}
    for c in CLAIMS:
        mods[c["modality"]] = mods.get(c["modality"], 0) + 1
    print(f"entities={len(ENTITIES)} claims={len(CLAIMS)} conflicts=0 gaps={len(GAPS)} "
          f"refs={len(EVIDENCE_INDEX)} (all quotes verified, none repeated on its page) modalities={mods}")


if __name__ == "__main__":
    main()
