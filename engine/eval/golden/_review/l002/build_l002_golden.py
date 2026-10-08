#!/usr/bin/env python3
"""L002 golden reference builder and provenance checker.

REFERENCE / PROVENANCE MATERIAL ONLY. Not Hive runtime code, not grader code.

Usage:
    python3 -I build_l002_golden.py <hiveforyou-v2 repo root> <output dir> [uploaded-pdf dir]

What it does:
  1. Reads the committed Hive document-pages snapshots for the nine L002 PDFs
     (the repo stores this corpus as engine/intake/fixtures/caleb9).
  2. Checks each snapshot's sourcePdfSha256 against the corpus manifest and, when
     the PDFs are present (in the corpus or the optional upload dir), against the
     SHA-256 of the PDF bytes.
  3. Locates every evidence quote as consecutive words on its cited page, using
     the same normalization as engine/core/src/document/normalize-quote-text.ts.
     Aborts if any quote is not found.
  4. Records every quote's first-occurrence word range and how many times it
     occurs on its page.
  5. Writes l002-golden.v4.json (canonical-study-proposal/4) and
     l002-golden.evidence-index.json.
"""
import hashlib
import json
import os
import re
import sys
import unicodedata

CASE_ID = "l002"
CORPUS_REL = "engine/intake/fixtures/caleb9"

SRC = {
    1: "l002-src-1", 2: "l002-src-2", 3: "l002-src-3", 4: "l002-src-4", 5: "l002-src-5",
    6: "l002-src-6", 7: "l002-src-7", 8: "l002-src-8", 9: "l002-src-9",
}
FILE_OF = {
    "l002-src-1": "01_prior_eligibility_determination.pdf",
    "l002-src-2": "02_prior_iep.pdf",
    "l002-src-3": "03_annual_progress_report.pdf",
    "l002-src-4": "04_reevaluation_plan.pdf",
    "l002-src-5": "05_psychoeducational_reevaluation.pdf",
    "l002-src-6": "06_academic_reevaluation.pdf",
    "l002-src-7": "07_speech_language_review.pdf",
    "l002-src-8": "08_reevaluation_eligibility_determination.pdf",
    "l002-src-9": "09_reevaluation_iep.pdf",
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
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def load_word_layer(repo, upload_dir):
    corpus = os.path.join(repo, CORPUS_REL)
    manifest = json.load(open(os.path.join(corpus, "manifest.json")))
    by_name = {f["filename"]: f for f in manifest["files"]}
    pages = {}
    hash_report = {}
    for sid, fname in FILE_OF.items():
        entry = by_name.get(fname)
        if entry is None:
            sys.exit(f"ABORT: {fname} not in corpus manifest")
        snap_path = os.path.join(corpus, "document-pages", fname[:-4] + ".json")
        snap = json.load(open(snap_path))
        if snap.get("sourcePdfFileName") not in (None, fname):
            sys.exit(f"ABORT: snapshot {snap_path} names {snap.get('sourcePdfFileName')}")
        if snap.get("sourcePdfSha256") != entry["sha256"]:
            sys.exit(f"ABORT: snapshot hash for {fname} does not match manifest")
        checks = {"manifest": entry["sha256"], "snapshot": snap["sourcePdfSha256"]}
        for label, d in (("corpusPdf", corpus), ("uploadedPdf", upload_dir)):
            if d and os.path.exists(os.path.join(d, fname)):
                got = sha256_file(os.path.join(d, fname))
                if got != entry["sha256"]:
                    sys.exit(f"ABORT: {label} {fname} sha256 {got} != manifest")
                checks[label] = got
        hash_report[sid] = {"filename": fname, **checks,
                            "productionSourceDocumentId": entry.get("sourceDocumentId")}
        dp = snap["documentPages"]
        for p in dp["pages"]:
            words = p["words"]
            for i, w in enumerate(words):
                if w["seq"] != i:
                    sys.exit(f"ABORT: {fname} p{p['pageNumber']} seq gap at {i}")
            pages[(sid, p["pageNumber"])] = [norm(w["text"]) for w in words]
        pages[(sid, "documentId")] = dp["documentId"]
    return pages, hash_report


def find_all(words, quote):
    toks = norm(quote).split(" ")
    hits = []
    for s in range(0, len(words) - len(toks) + 1):
        if words[s:s + len(toks)] == toks:
            hits.append((s, s + len(toks) - 1))
    return hits


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
IEP_2023 = PERIOD("2023-10-24", "2024-10-23")   # 02_prior_iep p1 "IEP Period"
IEP_2026 = PERIOD("2026-10-21", "2027-10-20")   # 09_reevaluation_iep p1 "IEP Period"
GOAL_ORF = PERIOD("2023-10-24", "2024-10-23")   # goal Start Date / Target Date
GOAL_RC = PERIOD("2026-10-21", "2027-10-20")    # goal Start Date / Target Date

# Document dates (each stated on the document itself). Used as occurredOn for
# facts a document reports without a separate measurement date.
D1, D2, D3, D4, D5 = "2023-10-12", "2023-10-24", "2024-10-15", "2026-09-08", "2026-09-22"
D6, D7, D8, D9 = "2026-09-29", "2026-10-06", "2026-10-14", "2026-10-21"

SP = "special_education"


def build():
    # ============================================================ entities
    ENT("ent_student", "student", "Caleb Nguyen",
        [R(1, 1, "Student: Caleb Nguyen"), R(1, 1, "Caleb has difficulty reading connected")],
        aliases=["Caleb"])
    ENT("ent_school", "school", "Synthetic Elementary School",
        [R(1, 1, "School: Synthetic Elementary School")])
    ENT("ent_district", "school_district", "Synthetic District",
        [R(1, 1, "District: Synthetic District"), R(4, 1, "Prepared By: District")],
        aliases=["District"])
    ENT("ent_elig_2023", "eligibility_determination", "Eligibility Determination (2023-10-12)",
        [R(1, 1, "Eligibility Determination SYNTHETIC DEVELOPMENT RECORD"),
         R(1, 1, "Determination Date: 2023-10-12")])
    ENT("ent_iep_2023", "iep", "IEP (2023-10-24)",
        [R(2, 1, "Individualized Education Program (IEP)"), R(2, 1, "IEP Date: 2023-10-24")])
    ENT("ent_progress_2024", "progress_report", "IEP Annual Progress Report (2024-10-15)",
        [R(3, 1, "IEP Annual Progress Report"), R(3, 1, "Report Date: 2024-10-15")])
    ENT("ent_reeval_plan", "reevaluation_plan", "Reevaluation Plan (2026-09-08)",
        [R(4, 1, "Reevaluation Planning Form"), R(4, 1, "Planning Date: 2026-09-08")])
    ENT("ent_psych_2026", "evaluation_report", "Psychoeducational Reevaluation Report (2026-09-22)",
        [R(5, 1, "Psychoeducational Reevaluation Report"), R(5, 1, "Evaluation Date: 2026-09-22")])
    ENT("ent_academic_2026", "evaluation_report", "Academic Reevaluation Report (2026-09-29)",
        [R(6, 1, "Academic Reevaluation Report"), R(6, 1, "Evaluation Date: 2026-09-29")])
    ENT("ent_sl_2026", "evaluation_report", "Speech-Language Review (2026-10-06)",
        [R(7, 1, "Speech-Language Review SYNTHETIC DEVELOPMENT RECORD"),
         R(7, 1, "Review Date: 2026-10-06")])
    ENT("ent_elig_2026", "eligibility_determination",
        "Reevaluation Eligibility Determination (2026-10-14)",
        [R(8, 1, "Reevaluation Eligibility Determination SYNTHETIC DEVELOPMENT RECORD"),
         R(8, 1, "Determination Date: 2026-10-14")])
    ENT("ent_iep_2026", "iep", "IEP (2026-10-21)",
        [R(9, 1, "Individualized Education Program (IEP)"), R(9, 1, "IEP Date: 2026-10-21")])
    ENT("ent_goal_orf", "annual_goal", "Annual goal GOAL_ORF_FLUENCY",
        [R(2, 1, "Goal ID: GOAL_ORF_FLUENCY"), R(3, 1, "Goal ID: GOAL_ORF_FLUENCY")])
    ENT("ent_goal_rc", "annual_goal", "Annual goal GOAL_READING_COMPREHENSION",
        [R(9, 1, "Goal ID: GOAL_READING_COMPREHENSION")])

    S = "ent_student"

    # ============================================================ student identity
    C(S, "student_name", None, None, t("Caleb Nguyen"), "observed",
      [R(k, 1, "Student: Caleb Nguyen") for k in range(1, 10)])
    C(S, "date_of_birth", None, None, d("2016-03-09"), "observed",
      [R(k, 1, "Date of Birth: 2016-03-09") for k in range(1, 10)])
    C(S, "grade_level", None, None, cd("2"), "observed",
      [R(1, 1, "Grade: 2"), R(2, 1, "Grade: 2")], occurredOn=D1)
    C(S, "grade_level", None, None, cd("3"), "observed",
      [R(3, 1, "Grade: 3")], occurredOn=D3)
    C(S, "grade_level", None, None, cd("5"), "observed",
      [R(k, 1, "Grade: 5") for k in range(4, 10)], occurredOn=D4)
    C(S, "school", None, None, e("ent_school"), "observed",
      [R(k, 1, "School: Synthetic Elementary School") for k in range(1, 10)])
    C(S, "district", None, None, e("ent_district"), "observed",
      [R(k, 1, "District: Synthetic District") for k in range(1, 10)])

    # ============================================================ 01 prior eligibility (2023-10-12)
    E1 = "ent_elig_2023"
    C(E1, "determination_date", None, None, d(D1), "observed",
      [R(1, 1, "Determination Date: 2023-10-12"), R(2, 1, "Determination Date: 2023-10-12")])
    C(E1, "determination_type", None, None, t("Eligibility Determination"), "observed",
      [R(1, 1, "Determination Type: Eligibility Determination")])
    C(E1, "determined_by", None, None, t("Eligibility team"), "observed",
      [R(1, 1, "Determination By: Eligibility team")])
    C(E1, "is_medical_diagnosis", None, None, b(False), "observed",
      [R(1, 1, "This document records an educational eligibility determination. It is not a medical diagnosis."),
       R(1, 1, "This is an educational eligibility determination, not a medical diagnosis."),
       R(2, 1, "This IEP implements the educational eligibility determination. It is not a medical diagnosis.")])
    for item in ["[X] Teacher information regarding classroom reading performance",
                 "[X] Review of existing educational records",
                 "[X] Classroom work samples related to connected-text reading"]:
        label = item[4:]
        C(E1, "information_reviewed", re.sub(r"[^a-z]+", "_", label.lower()).strip("_"), None,
          t(label), "observed", [R(1, 1, item)], occurredOn=D1)

    C(S, "special_education_eligibility", None, "eligibility_determination", b(True), "decided",
      [R(1, 1, "[X] Eligible for special education"),
       R(1, 1, "Eligible for special education. This is an educational")],
      occurredOn=D1)
    C(S, "eligibility_category", None, "eligibility_determination",
      t("Specific Learning Disability (SLD) - Reading"), "decided",
      [R(1, 1, "Eligibility Category: Specific Learning Disability (SLD) - Reading"),
       R(1, 1, "Eligibility category: Specific Learning Disability (SLD) - Reading."),
       R(2, 1, "Eligibility Category: Specific Learning Disability (SLD) - Reading")],
      occurredOn=D1)
    C(S, "primary_educational_need", None, "eligibility_determination", t("Reading Fluency"), "decided",
      [R(1, 1, "Primary Educational Need: Reading Fluency"),
       R(1, 1, "Primary educational need: Reading Fluency."),
       R(2, 1, "Primary Educational Need: Reading Fluency"),
       R(2, 1, "The primary educational need is Reading Fluency."),
       R(2, 2, "This IEP addresses Reading Fluency for Caleb Nguyen.")],
      occurredOn=D1)
    C(S, "requires_specially_designed_instruction", "reading_fluency", "eligibility_determination",
      b(True), "decided",
      [R(1, 1, "The team determined that Caleb requires specially designed instruction targeting the documented reading fluency need."),
       R(1, 2, "The team determined that Caleb requires specially designed instruction to address the documented reading-fluency need.")],
      occurredOn=D1)

    # Observations recorded at the 2023 determination and restated in the 2023 IEP
    C(S, "reading_concern", "reading_fluency", "classroom_information",
      t("persistent reading fluency concern"), "observed",
      [R(1, 1, "Classroom information documents a persistent reading fluency concern."),
       R(2, 1, "Caleb has a persistent reading fluency concern.")], occurredOn=D1)
    C(S, "reading_difficulty", "connected_grade_level_text", "classroom_performance",
      t("difficulty reading connected grade-level text at an expected rate"), "observed",
      [R(1, 1, "Caleb has difficulty reading connected grade-level text at an expected rate."),
       R(1, 2, "Teacher information and classroom performance document a persistent difficulty reading connected grade-level text at an expected rate."),
       R(2, 1, "Classroom performance indicates difficulty reading connected grade-level text at an expected rate."),
       R(2, 1, "Caleb has difficulty reading connected grade-level text at an expected rate.")],
      occurredOn=D1)
    C(S, "connected_text_reading_quality", "connected_text_reading", "classroom_reading_tasks",
      t("slow and effortful"), "observed",
      [R(1, 1, "Connected-text reading is slow and effortful during classroom reading tasks."),
       R(2, 1, "Connected-text reading is slow and effortful, with frequent pauses during classroom reading tasks.")],
      occurredOn=D1)
    C(S, "isolated_vs_connected_word_reading", "word_reading", None,
      t("isolated word reading stronger than reading of connected passages"), "observed",
      [R(1, 1, "Isolated word reading appears stronger than reading of connected passages."),
       R(2, 1, "Word reading of isolated items is stronger than reading of connected passages.")],
      occurredOn=D1)
    C(S, "general_reasoning", None, "available_educational_information",
      t("broadly within the expected range for age"), "observed",
      [R(1, 1, "general reasoning and cognitive functioning are broadly within the expected range for age."),
       R(1, 2, "Existing evaluation information indicates that general reasoning is broadly within the expected range for age.")],
      occurredOn=D1)
    C(S, "global_cognitive_limitation_is_primary_explanation", "reading_concern", "eligibility_determination",
      b(False), "observed",
      [R(1, 1, "A global cognitive limitation is not identified as the primary explanation for the reading concern."),
       R(1, 2, "A global cognitive limitation is not identified as the primary explanation.")],
      occurredOn=D1)

    # ============================================================ 02 prior IEP (2023-10-24)
    I1 = "ent_iep_2023"
    C(I1, "iep_date", None, None, d(D2), "observed",
      [R(2, 1, "IEP Date: 2023-10-24"),
       R(2, 2, "District Representative: [Synthetic signature omitted] Date: 2023-10-24")])
    C(I1, "iep_period", None, None, per("2023-10-24", "2024-10-23"), "decided",
      [R(2, 1, "IEP Period: 2023-10-24 through 2024-10-23")])
    C(I1, "implements_eligibility_determination", None, None, e("ent_elig_2023"), "decided",
      [R(2, 1, "This IEP implements the educational eligibility determination."),
       R(2, 1, "Determination Date: 2023-10-12")])
    C(S, "oral_reading_fluency", None, "present_levels_baseline", q(62, "WCPM"), "observed",
      [R(2, 1, "Present levels document an oral reading fluency baseline of 62 WCPM."),
       R(2, 2, "The documented baseline is 62 WCPM.")], occurredOn=D2)
    C(S, "educational_need_impact", "grade_level_reading_activities", None,
      t("affects ability to access grade-level reading activities independently"), "observed",
      [R(2, 1, "This difficulty affects Caleb's ability to access grade-level reading activities independently.")],
      occurredOn=D2)
    C(I1, "annual_goal", None, None, e("ent_goal_orf"), "decided",
      [R(2, 1, "Goal ID: GOAL_ORF_FLUENCY")], period=IEP_2023)

    G1 = "ent_goal_orf"
    C(G1, "goal_id", None, None, cd("GOAL_ORF_FLUENCY"), "observed",
      [R(2, 1, "Goal ID: GOAL_ORF_FLUENCY"), R(3, 1, "Goal ID: GOAL_ORF_FLUENCY")])
    C(G1, "goal_area", None, None, t("reading fluency"), "observed",
      [R(3, 1, "Area: reading fluency")])
    C(G1, "goal_condition", None, None, t("grade-level connected text passage"), "planned",
      [R(2, 1, "Given a grade-level connected text passage,"),
       R(3, 1, "Given a grade-level connected text passage,")], period=GOAL_ORF)
    C(G1, "goal_target", "oral_reading_fluency", None, q(95, "WCPM"), "planned",
      [R(2, 1, "Caleb will read at least 95 words correct per minute (WCPM) across three consecutive probes."),
       R(2, 2, "Target: 95 WCPM"),
       R(2, 2, "The annual goal targets 95 WCPM across three consecutive probes by 2024-10-23."),
       R(3, 1, "Caleb will read at least 95 words correct per minute (WCPM) across three consecutive probes."),
       R(3, 1, "Annual Target: 95 WCPM")], period=GOAL_ORF)
    C(G1, "goal_baseline", "oral_reading_fluency", None, q(62, "WCPM"), "observed",
      [R(2, 1, "Baseline: 62 WCPM")], occurredOn=D2)
    C(G1, "mastery_criterion", None, None, t("across three consecutive probes"), "planned",
      [R(2, 2, "Mastery Criterion: across three consecutive probes")], period=GOAL_ORF)
    C(G1, "goal_start_date", None, None, d("2023-10-24"), "planned",
      [R(2, 2, "Start Date: 2023-10-24"), R(3, 1, "Goal Start Date: 2023-10-24")])
    C(G1, "goal_target_date", None, None, d("2024-10-23"), "planned",
      [R(2, 2, "Target Date: 2024-10-23"), R(3, 1, "Goal Target Date: 2024-10-23")])
    C(G1, "progress_measurement_method", None, None,
      t("curriculum-based oral reading fluency probes"), "planned",
      [R(2, 2, "Progress will be measured using curriculum-based oral reading fluency probes."),
       R(3, 1, "Progress will continue to be monitored using curriculum-based oral reading fluency probes.")],
      period=GOAL_ORF)
    C(G1, "progress_reporting_frequency", None, None,
      t("at least annually, concurrent with report periods"), "planned",
      [R(2, 2, "Progress toward the annual goal will be measured using oral-reading-fluency probes and reported at least annually, concurrent with report periods.")],
      period=IEP_2023)

    SRI = "specialized_reading_instruction"
    C(I1, "service_frequency", SRI, SP, q(5, "sessions/week"), "decided",
      [R(2, 2, "Specialized reading instruction 5 sessions per week"),
       R(2, 2, "Specialized reading instruction is provided 5 sessions per week")], period=IEP_2023)
    C(I1, "service_session_length", SRI, SP, q(45, "minutes"), "decided",
      [R(2, 2, "5 sessions per week 45 minutes per session special education setting 2023-10-24"),
       R(2, 2, "for 45 minutes per session in the special education setting.")], period=IEP_2023)
    C(I1, "service_location", SRI, SP, t("special education setting"), "decided",
      [R(2, 2, "45 minutes per session special education setting 2023-10-24"),
       R(2, 2, "in the special education setting.")], period=IEP_2023)
    C(I1, "service_start_date", SRI, SP, d("2023-10-24"), "decided",
      [R(2, 2, "special education setting 2023-10-24")])
    C(I1, "accommodation", "extended_time", None,
      t("Extended time (1.5x) on classroom and district assessments"), "decided",
      [R(2, 2, "• Extended time (1.5x) on classroom and district assessments.")], period=IEP_2023)
    C(I1, "iep_team_roles", None, None,
      t("Parent/Guardian; General Education Teacher; Special Education Teacher; District Representative"),
      "observed",
      [R(2, 2, "The following roles participate in development of this IEP."),
       R(2, 2, "Parent/Guardian: [Synthetic signature omitted]"),
       R(2, 2, "General Education Teacher: [Synthetic signature omitted]"),
       R(2, 2, "Special Education Teacher: [Synthetic signature omitted]"),
       R(2, 2, "District Representative: [Synthetic signature omitted]")], occurredOn=D2)

    # ============================================================ 03 progress report (2024-10-15)
    P3 = "ent_progress_2024"
    C(P3, "report_date", None, None, d(D3), "observed", [R(3, 1, "Report Date: 2024-10-15")])
    C(P3, "prepared_by", None, None, t("Special education teacher"), "observed",
      [R(3, 1, "Prepared By: Special education teacher")])
    C(P3, "reporting_period", None, None, t("Annual progress toward current IEP goal"), "observed",
      [R(3, 1, "Reporting Period: Annual progress toward current IEP goal")])
    C(P3, "goal_monitored", None, None, e("ent_goal_orf"), "observed",
      [R(3, 1, "Goal Being Monitored"), R(3, 1, "Goal ID: GOAL_ORF_FLUENCY")])
    C(S, "oral_reading_fluency", "grade_level_connected_text", "progress_monitoring", q(91, "WCPM"),
      "observed",
      [R(3, 1, "Oral reading fluency 91 WCPM 95 WCPM"),
       R(3, 1, "On 2024-10-15, Caleb read grade-level connected text at 91 WCPM.")], occurredOn=D3)
    C(G1, "progress_toward_goal", None, "progress_monitoring",
      t("meaningful progress toward the annual target"), "observed",
      [R(3, 1, "This result shows meaningful progress toward the annual target of 95 WCPM.")],
      occurredOn=D3)
    C(G1, "goal_target_met", None, "progress_monitoring", b(False), "observed",
      [R(3, 1, "The annual target has not yet been met.")], occurredOn=D3)
    C(S, "receives_service", SRI, "current_iep", b(True), "observed",
      [R(3, 1, "Caleb Nguyen continues to receive specialized reading instruction under the current IEP.")],
      occurredOn=D3)
    C(S, "oral_reading_rate_change", None, "instructional_notes",
      t("improved relative to earlier instructional performance"), "observed",
      [R(3, 1, "Oral reading rate has improved relative to earlier instructional performance.")],
      occurredOn=D3)
    C(P3, "instructional_note", "connected_text_practice", None,
      t("additional practice with connected text remains appropriate"), "observed",
      [R(3, 1, "Additional practice with connected text remains appropriate during the remainder of the goal period.")],
      occurredOn=D3)
    C(P3, "revises_present_levels_or_iep", None, None, b(False), "observed",
      [R(3, 1, "This report records current progress toward the existing goal and does not revise present levels or rewrite the IEP.")])
    C(P3, "changes_eligibility_services_or_accommodations", None, None, b(False), "observed",
      [R(3, 1, "No change to eligibility, services, or accommodations is made in this report.")])

    # ============================================================ 04 reevaluation plan (2026-09-08)
    P4 = "ent_reeval_plan"
    C(P4, "planning_date", None, None, d(D4), "observed", [R(4, 1, "Planning Date: 2026-09-08")])
    C(P4, "prepared_by", None, None, e("ent_district"), "observed", [R(4, 1, "Prepared By: District")])
    C(P4, "document_type", None, None, t("Reevaluation plan"), "observed",
      [R(4, 1, "Document Type: Reevaluation plan")])
    C(S, "receives_special_education_under_iep", None, None, b(True), "observed",
      [R(4, 1, "Caleb currently receives special education services under an IEP.")], occurredOn=D4)
    C(S, "existing_eligibility_determination", "reading", None, b(True), "observed",
      [R(4, 1, "Caleb Nguyen has an existing eligibility determination in reading.")], occurredOn=D4)
    C(P4, "reevaluation_purpose", None, None,
      t("review current educational needs related to reading fluency and other reading performance"),
      "planned",
      [R(4, 1, "A reevaluation is being planned to review current educational needs related to reading fluency and other reading performance.")],
      occurredOn=D4)
    C(P4, "planned_team_action", None, None,
      t("review existing data and obtain current information to determine continued need for specially designed instruction"),
      "planned",
      [R(4, 1, "The team will review existing data and obtain current information needed to determine whether the student continues to have an educational need for specially designed instruction.")],
      occurredOn=D4)
    C(P4, "reports_evaluation_results", None, None, b(False), "observed",
      [R(4, 1, "It does not report completed evaluation results."),
       R(4, 1, "[ ] Completed reevaluation scores"),
       R(4, 2, "No new evaluation results are reported here.")])
    for item in ["[X] Current IEP and progress information",
                 "[X] Prior eligibility determination",
                 "[X] Teacher information regarding classroom reading performance"]:
        label = item[4:]
        C(P4, "existing_information_available", re.sub(r"[^a-z]+", "_", label.lower()).strip("_"),
          None, t(label), "observed", [R(4, 1, item)], occurredOn=D4)
    for item in ["[X] Current reading achievement", "[X] Reading comprehension",
                 "[X] Oral reading fluency", "[X] Cognitive / processing context",
                 "[X] Speech-language review", "[X] Review of existing data"]:
        label = item[4:]
        C(P4, "proposed_evaluation_area", re.sub(r"[^a-z]+", "_", label.lower()).strip("_"),
          None, t(label), "planned", [R(4, 1, item)], occurredOn=D4)
    for item in ["[X] Review of existing educational records", "[X] Teacher input",
                 "[X] Parent input", "[X] Current academic assessment of reading",
                 "[X] Psychoeducational information as needed for reevaluation"]:
        label = item[4:]
        C(P4, "information_to_be_gathered", re.sub(r"[^a-z]+", "_", label.lower()).strip("_"),
          None, t(label), "planned", [R(4, 1, item)], occurredOn=D4)
    C(P4, "assessments_completion_timing", None, None,
      t("before the reevaluation eligibility meeting"), "planned",
      [R(4, 2, "Assessments listed above will be completed before the reevaluation eligibility meeting.")],
      occurredOn=D4)

    # ============================================================ 05 psychoeducational (2026-09-22)
    P5 = "ent_psych_2026"
    C(P5, "evaluation_date", None, None, d(D5), "observed",
      [R(5, 1, "Evaluation Date: 2026-09-22"),
       R(8, 1, "[X] Psychoeducational Reevaluation - 2026-09-22")])
    C(P5, "evaluator", None, None, t("School psychologist"), "observed",
      [R(5, 1, "Evaluator: School psychologist")])
    C(P5, "evaluation_reason", None, None,
      t("part of the required review of special education eligibility and educational need"),
      "observed",
      [R(5, 1, "Caleb is being reevaluated as part of the required review of special education eligibility and educational need.")])
    C(S, "iep_addresses", None, None, t("reading"), "observed",
      [R(5, 1, "Caleb Nguyen currently has an IEP addressing reading.")], occurredOn=D5)
    C(P5, "evaluation_scope", None, None, t("cognitive and processing context"), "observed",
      [R(5, 1, "This psychoeducational reevaluation provides cognitive and processing context.")])
    C(P5, "replaces_academic_achievement_testing", None, None, b(False), "observed",
      [R(5, 1, "It is not a substitute for academic achievement testing."),
       R(5, 2, "This report does not replace academic achievement testing.")])
    for item in ["• Reevaluation plan", "• Review of existing educational records",
                 "• Teacher information regarding classroom reading tasks",
                 "• Student observation during the evaluation session"]:
        label = item[2:]
        C(P5, "source_of_information", re.sub(r"[^a-z]+", "_", label.lower()).strip("_"), None,
          t(label), "observed", [R(5, 1, item)], occurredOn=D5)
    C(S, "cognitive_ability", None, "psychoeducational_reevaluation",
      t("broadly within the average range"), "observed",
      [R(5, 1, "Cognitive ability is broadly within the average range."),
       R(5, 2, "Cognitive ability is broadly within the average range."),
       R(8, 1, "Psychoeducational evidence indicates cognitive ability is broadly within the average range."),
       R(8, 2, "Psychoeducational evidence indicates cognitive ability is broadly within the average range.")],
      occurredOn=D5)
    C(S, "cognitive_task_performance", None, "psychoeducational_reevaluation",
      t("consistent with age expectations"), "observed",
      [R(5, 1, "Performance across verbal reasoning, visual-spatial reasoning, and working-memory tasks was consistent with age expectations."),
       R(5, 2, "General reasoning, working memory, and verbal comprehension observed during this reevaluation are consistent with age expectations.")],
      occurredOn=D5)
    C(S, "processing_speed_global_limitation", None, "psychoeducational_reevaluation", b(False),
      "observed",
      [R(5, 1, "Processing speed observed during structured tasks was not identified as a global limitation.")],
      occurredOn=D5)
    C(S, "evaluation_participation", None, "psychoeducational_reevaluation",
      t("participated cooperatively and understood ordinary verbal directions"), "observed",
      [R(5, 1, "Caleb participated cooperatively and understood ordinary verbal directions.")],
      occurredOn=D5)
    C(S, "global_cognitive_limitation_is_primary_explanation", "reading_concern",
      "psychoeducational_reevaluation", b(False), "observed",
      [R(5, 1, "No global cognitive limitation is identified as the primary explanation for the documented reading concern."),
       R(5, 2, "No global cognitive limitation is identified as the primary explanation for the documented reading concern."),
       R(8, 1, "A global cognitive limitation is not identified as the primary explanation.")],
      occurredOn=D5)
    C(S, "general_reasoning", None, "psychoeducational_reevaluation",
      t("adequate to benefit from classroom instruction when material is accessible"), "observed",
      [R(5, 1, "General reasoning is adequate to benefit from classroom instruction when material is accessible.")],
      occurredOn=D5)
    C(S, "reading_instructional_status", "reading", "classroom_information",
      t("remains an area of instructional attention under the current IEP"), "observed",
      [R(5, 2, "Classroom information indicates that reading remains an area of instructional attention under the current IEP.")],
      occurredOn=D5)
    C(P5, "evaluation_recommendation", "academic_achievement_assessment", None,
      t("complete current academic achievement assessment, including reading comprehension and fluency, before the reevaluation eligibility meeting"),
      "observed",
      [R(5, 2, "Complete current academic achievement assessment, including reading comprehension and fluency, before the reevaluation eligibility meeting.")],
      occurredOn=D5)
    C(P5, "determines_special_education_eligibility", None, None, b(False), "observed",
      [R(5, 2, "This report does not determine special education eligibility")])
    C(P5, "assigns_iep_services_or_goals", None, None, b(False), "observed",
      [R(5, 2, "does not assign IEP services or annual goals.")])

    # ============================================================ 06 academic (2026-09-29)
    P6 = "ent_academic_2026"
    C(P6, "evaluation_date", None, None, d(D6), "observed",
      [R(6, 1, "Evaluation Date: 2026-09-29"),
       R(6, 1, "This academic reevaluation was completed on 2026-09-29"),
       R(8, 1, "[X] Academic Reevaluation - 2026-09-29")])
    C(P6, "evaluator", None, None, t("Academic evaluator"), "observed",
      [R(6, 1, "Evaluator: Academic evaluator")])
    C(P6, "evaluation_focus", None, None,
      t("Reading achievement, fluency, accuracy, and comprehension"), "observed",
      [R(6, 1, "Focus: Reading achievement, fluency, accuracy, and comprehension"),
       R(6, 1, "The evaluation examines oral reading fluency, reading accuracy, and reading comprehension.")])
    C(S, "oral_reading_fluency", "grade_level_connected_text", "academic_reevaluation",
      q(104, "WCPM"), "observed",
      [R(6, 1, "Oral Reading Fluency 104 WCPM"),
       R(6, 1, "Caleb read grade-level connected text at 104 WCPM,"),
       R(6, 1, "Academic reevaluation documents oral reading fluency of 104 WCPM on grade-level passages,"),
       R(8, 1, "Current academic reevaluation results include oral reading fluency of 104 WCPM"),
       R(8, 2, "Current academic reevaluation documents oral reading fluency of 104 WCPM"),
       R(9, 1, "Recent academic reevaluation documented oral reading fluency of 104 WCPM on grade-level passages.")],
      occurredOn=D6)
    C(S, "reading_accuracy", "grade_level_connected_text", "academic_reevaluation",
      q(97, "%"), "observed",
      [R(6, 1, "Reading accuracy 97%"),
       R(6, 1, "with reading accuracy of 97%."),
       R(6, 1, "with reading accuracy of 97 percent."),
       R(8, 1, "reading accuracy of 97%."),
       R(8, 2, "reading accuracy of 97 percent,")],
      occurredOn=D6)
    C(S, "reading_comprehension_standard_score", "reading_comprehension",
      "standardized_achievement_subtest", q(78, "standard score"), "observed",
      [R(6, 1, "Reading comprehension standard score of 78"),
       R(6, 1, "Reading comprehension, measured with a standardized achievement subtest, yielded a standard score of 78,"),
       R(8, 1, "Reading comprehension, measured with a standardized achievement subtest, yielded a standard score of 78,"),
       R(8, 2, "with a reading comprehension standard score of 78.")],
      occurredOn=D6)
    C(S, "reading_comprehension_vs_age_expectations", "reading_comprehension",
      "standardized_achievement_subtest", t("below age-based expectations"), "observed",
      [R(6, 1, "The reading comprehension standard score of 78 is below age-based expectations"),
       R(6, 1, "yielded a standard score of 78, which is below age-based expectations."),
       R(8, 1, "yielded a standard score of 78, which is below age-based expectations.")],
      occurredOn=D6)
    C(S, "reading_comprehension_score_is_percentage", "reading_comprehension",
      "standardized_achievement_subtest", b(False), "observed",
      [R(6, 1, "is not a percentage score.")], occurredOn=D6)
    C(S, "oral_reading_vs_earlier_records", "oral_reading_rate_and_accuracy", "academic_reevaluation",
      t("stronger than earlier instructional records"), "observed",
      [R(6, 1, "Oral reading rate and accuracy are stronger than earlier instructional records."),
       R(6, 1, "These oral reading results are stronger than earlier instructional records."),
       R(8, 1, "These oral reading results are stronger than earlier instructional records."),
       R(8, 2, "Fluency and accuracy are stronger than earlier instructional records."),
       R(9, 1, "Oral reading rate and accuracy are stronger than earlier instructional records.")],
      occurredOn=D6)
    C(S, "reading_difficulty", "constructing_meaning_from_grade_level_passages", "academic_reevaluation",
      t("continues to have difficulty constructing meaning from grade-level passages"), "observed",
      [R(6, 1, "Caleb Nguyen reads connected text with improved rate and accuracy but continues to have difficulty constructing meaning from grade-level passages."),
       R(6, 1, "Caleb reads connected text with improved rate and accuracy but continues to have difficulty constructing meaning from grade-level passages."),
       R(8, 1, "Caleb continues to have difficulty constructing meaning from grade-level passages even when oral reading rate and accuracy are stronger.")],
      occurredOn=D6)
    C(S, "most_evident_educational_concern", None, None, t("reading comprehension"), "observed",
      [R(6, 1, "Comprehension of grade-level text remains an area of educational concern."),
       R(8, 1, "The educational concern that remains most evident is reading comprehension."),
       R(8, 2, "Persistent weakness is now most evident in reading comprehension."),
       R(9, 1, "Persistent difficulty is now most evident when Caleb must construct meaning from grade-level text.")],
      occurredOn=D6)
    C(P6, "evaluation_recommendation", "instructional_planning", None,
      t("emphasize reading comprehension of connected grade-level text"), "observed",
      [R(6, 2, "Instructional planning should emphasize reading comprehension of connected grade-level text.")],
      occurredOn=D6)
    for item, task in [("• explicit instruction in constructing meaning from connected text", "constructing_meaning_instruction"),
                       ("• guided practice with literal and inferential questions", "literal_and_inferential_question_practice"),
                       ("• continued progress monitoring of reading comprehension", "reading_comprehension_progress_monitoring")]:
        C(P6, "evaluation_recommendation", task, None, t(item[2:]), "observed",
          [R(6, 2, item)], occurredOn=D6)
    C(P6, "recommendations_are_iep_decisions", None, None, b(False), "observed",
      [R(6, 1, "Recommendations in this report are evaluation recommendations and are not IEP decisions."),
       R(6, 2, "These results are evaluation findings and are not an IEP service or goal decision."),
       R(6, 2, "These recommendations are not mandated services or adopted annual goals.")])

    # ============================================================ 07 speech-language (2026-10-06)
    P7 = "ent_sl_2026"
    C(P7, "review_date", None, None, d(D7), "observed",
      [R(7, 1, "Review Date: 2026-10-06"),
       R(7, 1, "This speech-language review was completed on 2026-10-06"),
       R(8, 1, "[X] Speech-Language Review - 2026-10-06")])
    C(P7, "evaluator", None, None, t("Speech-language pathologist"), "observed",
      [R(7, 1, "Evaluator: Speech-language pathologist")])
    C(P7, "conducted_under_plan", None, None, e("ent_reeval_plan"), "observed",
      [R(7, 1, "as part of the reevaluation scope identified in the reevaluation plan.")])
    C(P7, "review_purpose", None, None,
      t("determine whether a separate speech-language educational need is present"), "observed",
      [R(7, 1, "The purpose is to determine whether a separate speech-language educational need is present.")])
    C(P7, "review_scope", None, None, t("limited to the speech-language domain"), "observed",
      [R(7, 1, "This review is limited to the speech-language domain.")])
    C(S, "review_participation", "language_tasks", "speech_language_review",
      t("participated in conversational and structured language tasks"), "observed",
      [R(7, 1, "Caleb participated in conversational and structured language tasks during the review.")],
      occurredOn=D7)
    C(S, "speech_intelligibility", None, "speech_language_review",
      t("adequate for classroom participation"), "observed",
      [R(7, 1, "language tasks during the review. Speech intelligibility is adequate for classroom participation."),
       R(7, 1, "Educational Interpretation Speech intelligibility is adequate for classroom participation.")],
      occurredOn=D7)
    C(S, "receptive_and_expressive_language", None, "speech_language_review",
      t("broadly functional for classroom communication"), "observed",
      [R(7, 1, "Receptive and expressive language observed during the review are broadly functional for classroom communication."),
       R(7, 1, "Receptive and expressive language observed during this review are broadly functional for classroom communication.")],
      occurredOn=D7)
    C(S, "speech_language_impairment_diagnosed", None, "speech_language_review", b(False), "observed",
      [R(7, 1, "No speech-language impairment is diagnosed in this report.")], occurredOn=D7)
    C(S, "separate_speech_language_educational_need", None, "speech_language_review", b(False),
      "observed",
      [R(7, 1, "No separate speech-language educational need is identified from this review."),
       R(8, 1, "No separate speech-language educational need is identified from this review."),
       R(8, 2, "The speech-language review identifies no separate speech-language educational need")],
      occurredOn=D7)
    C(S, "reading_comprehension_concern_domain", "reading_comprehension", "speech_language_review",
      t("an educational issue outside the speech-language domain"), "observed",
      [R(7, 1, "The documented reading comprehension concern remains an educational issue outside the speech-language domain.")],
      occurredOn=D7)
    C(S, "reading_concern_resolved_by_review", "reading_concern", "speech_language_review", b(False),
      "observed",
      [R(7, 1, "The documented reading concern for Caleb Nguyen is not treated as resolved by this review.")],
      occurredOn=D7)
    C(P7, "determines_reading_disability", None, None, b(False), "observed",
      [R(7, 1, "A speech-language review does not determine whether a reading disability is present.")])
    C(P7, "speech_language_service_recommended", None, None, b(False), "observed",
      [R(7, 1, "No speech-language service is recommended."),
       R(8, 2, "does not recommend a speech-language service.")], occurredOn=D7)
    C(P7, "evaluation_recommendation", "reading_concern", None,
      t("continue to address the documented reading concern through the educational reevaluation process"),
      "observed",
      [R(7, 1, "Continue to address the documented reading concern through the educational reevaluation process.")],
      occurredOn=D7)
    C(P7, "determines_special_education_eligibility", None, None, b(False), "observed",
      [R(7, 1, "This review does not determine whether the student meets special education eligibility criteria."),
       R(7, 1, "This report does not determine special education eligibility.")])

    # ============================================================ 08 reevaluation eligibility (2026-10-14)
    E2 = "ent_elig_2026"
    C(E2, "determination_date", None, None, d(D8), "observed",
      [R(8, 1, "Determination Date: 2026-10-14"), R(9, 1, "Determination Date: 2026-10-14")])
    C(E2, "determination_type", None, None, t("Reevaluation Eligibility Determination"), "observed",
      [R(8, 1, "Determination Type: Reevaluation Eligibility Determination")])
    C(E2, "determined_by", None, None, t("Eligibility team"), "observed",
      [R(8, 1, "Determination By: Eligibility team")])
    C(E2, "is_medical_diagnosis", None, None, b(False), "observed",
      [R(8, 1, "This document records an educational eligibility determination. It is not a medical diagnosis."),
       R(8, 1, "This is an educational eligibility determination, not a medical diagnosis."),
       R(9, 1, "This IEP implements the current educational eligibility determination. It is not a medical diagnosis.")])
    for item, ent, task in [("[X] Psychoeducational Reevaluation - 2026-09-22", "ent_psych_2026", "psychoeducational_reevaluation"),
                            ("[X] Academic Reevaluation - 2026-09-29", "ent_academic_2026", "academic_reevaluation"),
                            ("[X] Speech-Language Review - 2026-10-06", "ent_sl_2026", "speech_language_review")]:
        C(E2, "evaluation_evidence_reviewed", task, None, e(ent), "observed", [R(8, 1, item)],
          occurredOn=D8)
    C(E2, "evaluation_evidence_reviewed", "review_of_existing_educational_records", None,
      t("Review of existing educational records"), "observed",
      [R(8, 1, "[X] Review of existing educational records")], occurredOn=D8)
    C(S, "special_education_eligibility", None, "reevaluation_eligibility_determination", b(True),
      "decided",
      [R(8, 1, "[X] Student continues to meet criteria for special education"),
       R(8, 1, "The student continues to meet criteria for Specific Learning Disability (SLD) - Reading.")],
      occurredOn=D8)
    C(S, "eligibility_category", None, "reevaluation_eligibility_determination",
      t("Specific Learning Disability (SLD) - Reading"), "decided",
      [R(8, 1, "Eligibility Category: Specific Learning Disability (SLD) - Reading"),
       R(9, 1, "Eligibility Category: Specific Learning Disability (SLD) - Reading"),
       R(9, 1, "The eligibility category remains Specific Learning Disability (SLD) - Reading.")],
      occurredOn=D8)
    C(S, "eligibility_category_changed", None, "reevaluation_eligibility_determination", b(False),
      "decided",
      [R(8, 1, "Category Change: None. Eligibility category is unchanged."),
       R(8, 2, "The eligibility category has not changed.")], occurredOn=D8)
    C(S, "primary_educational_need", None, "reevaluation_eligibility_determination",
      t("Reading Comprehension"), "decided",
      [R(8, 1, "Primary Educational Need: Reading Comprehension"),
       R(8, 1, "Primary educational need: Reading Comprehension."),
       R(9, 1, "Primary Educational Need: Reading Comprehension"),
       R(9, 1, "The primary educational need is Reading Comprehension."),
       R(9, 3, "This IEP addresses Reading Comprehension for Caleb Nguyen.")],
      occurredOn=D8)
    C(S, "requires_specially_designed_instruction", "reading_comprehension",
      "reevaluation_eligibility_determination", b(True), "decided",
      [R(8, 2, "The team determined that Caleb Nguyen continues to require specially designed instruction targeting the documented reading comprehension need."),
       R(8, 2, "The team determined that Caleb continues to require specially designed instruction to address the documented reading comprehension need.")],
      occurredOn=D8)

    # ============================================================ 09 reevaluation IEP (2026-10-21)
    I2 = "ent_iep_2026"
    C(I2, "iep_date", None, None, d(D9), "observed",
      [R(9, 1, "IEP Date: 2026-10-21"),
       R(9, 2, "District Representative: [Synthetic signature omitted] Date: 2026-10-21")])
    C(I2, "iep_period", None, None, per("2026-10-21", "2027-10-20"), "decided",
      [R(9, 1, "IEP Period: 2026-10-21 through 2027-10-20")])
    C(I2, "implements_eligibility_determination", None, None, e("ent_elig_2026"), "decided",
      [R(9, 1, "This IEP implements the current educational eligibility determination."),
       R(9, 1, "Determination Date: 2026-10-14")])
    C(S, "comprehension_question_accuracy", "grade_level_reading_passages",
      "classroom_instructional_measure", q(60, "%"), "observed",
      [R(9, 1, "On grade-level reading passages, Caleb answers comprehension questions with 60% accuracy."),
       R(9, 1, "This classroom instructional measure is the present-levels baseline for the annual goal in this IEP."),
       R(9, 3, "The instructional baseline is 60% accuracy on grade-level passage comprehension questions.")],
      occurredOn=D9)
    C(S, "reading_difficulty", "grade_level_connected_text_questions", None,
      t("difficulty understanding and answering questions about grade-level connected text"),
      "observed",
      [R(9, 1, "Caleb has difficulty understanding and answering questions about grade-level connected text.")],
      occurredOn=D9)
    C(S, "educational_need_impact", "content_area_reading", None,
      t("affects ability to learn from grade-level reading in content-area classes"), "observed",
      [R(9, 1, "This difficulty affects Caleb's ability to learn from grade-level reading in content-area classes.")],
      occurredOn=D9)
    C(I2, "annual_goal", None, None, e("ent_goal_rc"), "decided",
      [R(9, 1, "Goal ID: GOAL_READING_COMPREHENSION")], period=IEP_2026)
    C(I2, "includes_oral_reading_fluency_goal", None, None, b(False), "decided",
      [R(9, 2, "This IEP does not include an oral-reading-fluency annual goal.")], period=IEP_2026)

    G2 = "ent_goal_rc"
    C(G2, "goal_id", None, None, cd("GOAL_READING_COMPREHENSION"), "observed",
      [R(9, 1, "Goal ID: GOAL_READING_COMPREHENSION")])
    C(G2, "goal_condition", None, None, t("grade-level informational or literary passage"), "planned",
      [R(9, 1, "Given a grade-level informational or literary passage,")], period=GOAL_RC)
    C(G2, "goal_question_types", None, None, t("literal and inferential"), "planned",
      [R(9, 1, "Caleb will answer comprehension questions (literal and inferential)")], period=GOAL_RC)
    C(G2, "goal_target", "comprehension_question_accuracy", None, q(80, "%"), "planned",
      [R(9, 1, "with at least 80% accuracy on three consecutive weekly probes."),
       R(9, 2, "Target: 80% accuracy"),
       R(9, 3, "The annual goal targets 80% accuracy on three consecutive weekly probes by 2027-10-20.")],
      period=GOAL_RC)
    C(G2, "goal_baseline", "comprehension_question_accuracy", None, q(60, "%"), "observed",
      [R(9, 2, "Baseline: 60% accuracy")], occurredOn=D9)
    C(G2, "mastery_criterion", None, None, t("on three consecutive weekly probes"), "planned",
      [R(9, 2, "Mastery Criterion: on three consecutive weekly probes")], period=GOAL_RC)
    C(G2, "goal_start_date", None, None, d("2026-10-21"), "planned",
      [R(9, 2, "Start Date: 2026-10-21")])
    C(G2, "goal_target_date", None, None, d("2027-10-20"), "planned",
      [R(9, 2, "Target Date: 2027-10-20")])
    C(G2, "progress_measurement_method", None, None,
      t("grade-level passage comprehension probes"), "planned",
      [R(9, 2, "Progress will be measured using grade-level passage comprehension probes."),
       R(9, 2, "Progress toward the annual comprehension goal will be measured using grade-level passage questions")],
      period=GOAL_RC)
    C(G2, "progress_reporting_frequency", None, None,
      t("quarterly, concurrent with report periods"), "planned",
      [R(9, 2, "reported quarterly, concurrent with report periods.")], period=IEP_2026)

    C(I2, "service_frequency", SRI, SP, q(5, "times/week"), "decided",
      [R(9, 2, "Specialized reading instruction 5x/week"),
       R(9, 2, "Specialized reading instruction continues five times per week")], period=IEP_2026)
    C(I2, "service_session_length", SRI, SP, q(45, "minutes"), "decided",
      [R(9, 2, "5x/week 45 minutes per session special education setting 2026-10-21"),
       R(9, 2, "for 45 minutes per session in the special education setting.")], period=IEP_2026)
    C(I2, "service_location", SRI, SP, t("special education setting"), "decided",
      [R(9, 2, "45 minutes per session special education setting 2026-10-21"),
       R(9, 2, "in the special education setting.")], period=IEP_2026)
    C(I2, "service_start_date", SRI, SP, d("2026-10-21"), "decided",
      [R(9, 2, "special education setting 2026-10-21")])
    C(I2, "accommodation", "extended_time", None,
      t("Extended time (1.5x) on classroom and district assessments"), "decided",
      [R(9, 2, "• Extended time (1.5x) on classroom and district assessments.")], period=IEP_2026)
    C(I2, "accommodation_continues_from_prior_iep", "extended_time", None, b(True), "decided",
      [R(9, 2, "Extended time (1.5x) continues from the prior IEP.")], period=IEP_2026)
    C(I2, "accommodation", "text_to_speech", None,
      t("Text-to-speech for lengthy content-area passages"), "decided",
      [R(9, 2, "• Text-to-speech for lengthy content-area passages.")], period=IEP_2026)
    C(I2, "accommodation_newly_added", "text_to_speech", None, b(True), "decided",
      [R(9, 2, "Text-to-speech for lengthy content-area passages is added so that length of assigned reading does not prevent access to content-area material.")],
      period=IEP_2026)
    C(I2, "iep_team_roles", None, None,
      t("Parent/Guardian; General Education Teacher; Special Education Teacher; District Representative"),
      "observed",
      [R(9, 2, "The following roles participate in development of this IEP."),
       R(9, 2, "Parent/Guardian: [Synthetic signature omitted]"),
       R(9, 2, "General Education Teacher: [Synthetic signature omitted]"),
       R(9, 2, "Special Education Teacher: [Synthetic signature omitted]"),
       R(9, 2, "District Representative: [Synthetic signature omitted]")], occurredOn=D9)

    # ============================================================ missing information
    GAPS.append({
        "id": "gap_001",
        "description": ("The 2026-09-08 reevaluation plan lists parent input as information to be "
                        "gathered for the reevaluation. None of the later supplied documents "
                        "(psychoeducational reevaluation, academic reevaluation, speech-language "
                        "review, reevaluation eligibility determination, reevaluation IEP) records "
                        "parent input or lists it among the sources reviewed. A record of the "
                        "parent input gathered would answer this."),
        "gapKind": "not_found_in_supplied_documents",
        "subjectEntityId": "ent_reeval_plan",
        "relatedConstruct": "information_to_be_gathered",
        "evidenceRefs": None,
        "proposalLineage": {"proposalItemId": "gap_001", "studyRunId": "golden-l002"},
    })

    voice = {
        "subject": {"value": None, "from": None, "evidenceRefs": None},
        "eventNoun": {"value": None, "from": None, "evidenceRefs": None},
        "helperNoun": {"value": None, "from": None, "evidenceRefs": None},
        "otherPartyNoun": {"value": "the district", "from": "document",
                           "evidenceRefs": finalize_refs("voice_other_party",
                                                         [R(4, 1, "Prepared By: District")])},
        "subjectName": {"value": "Caleb Nguyen", "from": "document",
                        "evidenceRefs": finalize_refs("voice_subject_name",
                                                      [R(1, 1, "Student: Caleb Nguyen")])},
    }
    return voice


def main():
    global PAGES
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    repo, out = sys.argv[1], sys.argv[2]
    upload_dir = sys.argv[3] if len(sys.argv) > 3 else None
    PAGES, hash_report = load_word_layer(repo, upload_dir)
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
        "proposedAt": "2026-10-07T00:00:00.000Z",
    }
    os.makedirs(out, exist_ok=True)
    json.dump(proposal, open(os.path.join(out, "l002-golden.v4.json"), "w"),
              indent=2, ensure_ascii=False)
    json.dump({"caseId": CASE_ID, "wordLayer": CORPUS_REL + "/document-pages",
               "wordRangeStatus": "verified",
               "sourceIds": FILE_OF, "sourceHashes": hash_report, "refs": EVIDENCE_INDEX},
              open(os.path.join(out, "l002-golden.evidence-index.json"), "w"),
              indent=2, ensure_ascii=False)

    print(f"entities={len(ENTITIES)} claims={len(CLAIMS)} conflicts=0 gaps={len(GAPS)} "
          f"refs={len(EVIDENCE_INDEX)} (all quotes verified)")
    amb = [r for r in EVIDENCE_INDEX if r["occurrencesOnPage"] > 1]
    print(f"refs whose quote occurs more than once on its page: {len(amb)}")
    for r in amb:
        print("  ", r["evidenceRefId"], r["sourceDocumentId"], r["page"], repr(r["quote"]),
              r["occurrencesOnPage"])


if __name__ == "__main__":
    main()
