"""
Independent provenance builder/checker for the iep-e-1 golden reference.

REFERENCE / PROVENANCE MATERIAL ONLY. This is not Hive runtime code and does
not model Hive's architecture. It does three things:

  1. Reads Hive's document-pages word layer for iep-e-1.pdf (the
     `DocumentPagesSnapshot` JSON written by
     engine/core/scripts/shadow-golden/ensure-document-pages.ts).
  2. Locates every evidence quote as a run of consecutive words on its cited
     page, using the same normalisation as Hive's verifier
     (engine/core/src/document/normalize-quote-text.ts). Aborts if any quote
     is missing, and counts how often each quote occurs on its page.
  3. Writes the canonical-study-proposal/4 golden and the evidence index.

Usage:
    python3 -I build_iep-e-1_golden.py <iep-e-1 document-pages JSON> <out dir>

Quote policy (see REVIEW.md):
  * A quote is the exact text of Hive's word layer at the cited place.
  * This PDF is a scanned form whose text layer is OCR. Where the layer text
    differs from what the printed page shows, the ref carries `page_text`
    (the reviewer's reading of the page). Those refs are reported as
    `layer_differs_from_page` so a reviewer can keep or drop them.
  * Where a value depends on a checkbox mark or an "X" in a table column, the
    ref carries `mark` (what the mark shows). The mark itself is a graphic and
    is not text in the layer.
"""
import hashlib
import json
import os
import re
import sys
import unicodedata

CASE = "iep-e-1"
PDF = "iep-e-1.pdf"
PDF_SHA256 = "30f7205cb81e2a2ce19f932a6ccb3175f55401c5bce776070d40303c5d748b27"
SRC_ID = f"{CASE}-src-1"
FILE_OF = {SRC_ID: PDF}

PAGES_JSON = sys.argv[1]
OUT = sys.argv[2]

snap = json.load(open(PAGES_JSON))
assert snap["sourcePdfFileName"] == PDF, snap["sourcePdfFileName"]
assert snap["sourcePdfSha256"] == PDF_SHA256, "word layer is for a different PDF"
WORDS = {}
for p in snap["documentPages"]["pages"]:
    ws = sorted(p["words"], key=lambda w: w["seq"])
    WORDS[p["pageNumber"]] = [(w["seq"], w["text"]) for w in ws]


# Mirrors normalizeQuoteForMatch in engine/core/src/document/normalize-quote-text.ts
def norm(text):
    t = unicodedata.normalize("NFKC", text)
    t = re.sub("[‘’‚‛]", "'", t)
    t = re.sub("[“”„‟]", '"', t)
    t = re.sub("[–—−]", "-", t)
    t = t.replace(" ", " ")
    t = re.sub(r"\s*\|\s*", " ", t)
    return re.sub(r"\s+", " ", t.strip())


def locate(page, quote):
    toks = norm(quote).split(" ")
    words = WORDS[page]
    hits = []
    for s in range(len(words) - len(toks) + 1):
        if all(norm(words[s + k][1]) == toks[k] for k in range(len(toks))):
            hits.append((words[s][0], words[s + len(toks) - 1][0]))
    if not hits:
        raise SystemExit(f"QUOTE NOT FOUND page={page}: {quote!r}")
    return hits


EVIDENCE_INDEX = []


def R(page, quote, page_text=None, mark=None, occ=1, occ_reason=None):
    hits = locate(page, quote)
    if occ > len(hits):
        raise SystemExit(f"occurrence {occ} requested but only {len(hits)} on page {page}: {quote!r}")
    if occ != 1 and not occ_reason:
        raise SystemExit(f"non-first occurrence needs a documented reason: {quote!r}")
    if page_text is not None:
        same = re.sub(r"\s", "", page_text) == re.sub(r"\s", "", quote)
        assert not same, f"page_text given but identical to layer text: {quote!r}"
    return {"page": page, "quote": quote, "hits": hits, "occ": occ, "occ_reason": occ_reason,
            "page_text": page_text, "mark": mark}


def finalize_refs(owner, refs):
    out = []
    for n, r in enumerate(refs, 1):
        rid = f"ev_{owner}_{n}"
        out.append({
            "id": rid,
            "sourceDocumentId": SRC_ID,
            "logicalDocumentId": None,
            "page": r["page"],
            "pageEnd": None,
            "spanStart": None,
            "spanEnd": None,
            "quote": r["quote"],
            "extractionId": None,
            "sourceType": "document",
        })
        start, end = r["hits"][r["occ"] - 1]
        EVIDENCE_INDEX.append({
            "evidenceRefId": rid,
            "owner": owner,
            "sourceDocumentId": SRC_ID,
            "documentId": PDF,
            "page": r["page"],
            "wordRange": {"startSeq": start, "endSeq": end},
            "occurrencesOnPage": len(r["hits"]),
            "occurrenceUsed": r["occ"],
            "occurrenceReason": r["occ_reason"],
            "quote": r["quote"],
            "layerMatchesPage": r["page_text"] is None,
            "pageText": r["page_text"],
            "valueFromMark": r["mark"],
        })
    return out


def V(kind, **kw):
    base = {"kind": kind, "numberValue": None, "textValue": None, "codeValue": None,
            "booleanValue": None, "entityId": None, "dateValue": None,
            "periodStart": None, "periodEnd": None, "unit": None}
    base.update(kw)
    return base


q = lambda n, unit=None: V("quantity", numberValue=n, unit=unit)
t = lambda s: V("text", textValue=s)
b = lambda x: V("boolean", booleanValue=x)
e = lambda i: V("entity_ref", entityId=i)
d = lambda s: V("date", dateValue=s)
per = lambda s, en: V("period", periodStart=s, periodEnd=en)

ENTITIES, CLAIMS, GAPS = [], [], []
ENT_IDS = set()


def ENT(eid, etype, label, refs, aliases=None):
    ENT_IDS.add(eid)
    ENTITIES.append({"id": eid, "entityType": etype, "label": label,
                     "aliases": aliases, "evidenceRefs": finalize_refs(eid, refs)})


def C(cid, subj, measure, task, admin, value, modality, refs, occurredOn=None, period=None):
    unit = value["unit"] if value["kind"] == "quantity" else None
    CLAIMS.append({
        "id": cid, "subjectEntityId": subj,
        "construct": {"measure": measure, "task": task, "administration": admin},
        "value": value, "unit": unit, "modality": modality,
        "effectivePeriod": period, "occurredOn": occurredOn,
        "evidenceRefs": finalize_refs(cid, refs),
    })


PLAN_PERIOD = {"start": "2012-01-17", "end": "2013-01-11", "precision": "day"}
PARTICIPANT_HEADER = ("The list below indicates that the individual participated in the development "
                      "ofthis Plan and the placement decision;")

# ====================================================================== entities
ENT("ent_student", "student", "Student (name redacted)",
    [R(1, "a/an IEP meeting has been scheduled for the above student.")])
ENT("ent_iep_meeting", "meeting", "IEP review meeting",
    [R(1, "This meeting has been scheduled for: Date 01/17/2012")])

ENT("ent_parent", "parent", "Parent (name redacted)",
    [R(3, "Parent Psychologist Special Education Teacher")])
ENT("ent_family_therapist", "team_member", "Family Therapist (name redacted)",
    [R(3, "Family Therapist")])
ENT("ent_gen_ed_teacher", "team_member", "General Education Teacher (name redacted)",
    [R(3, "General Education Teacher")])
ENT("ent_psychologist", "team_member", "Psychologist (name redacted)",
    [R(3, "Parent Psychologist Special Education Teacher")])
ENT("ent_sped_teacher", "team_member", "Special Education Teacher (name redacted)",
    [R(3, "Parent Psychologist Special Education Teacher")])
ENT("ent_primary_staff_contact", "team_member", "SC Structured Learning Teacher (name redacted)",
    [R(3, "SC Structured Learning Teacher")])

# ====================================================================== p1–p2: invitation and contact
C("c_meeting_scheduled_date", "ent_iep_meeting", "meeting_date", "scheduled", None,
  d("2012-01-17"), "planned",
  [R(1, "This meeting has been scheduled for: Date 01/17/2012"),
   R(2, "Meeting Date: 01/17/201 2")])
C("c_meeting_scheduled_time", "ent_iep_meeting", "meeting_time", "scheduled", None,
  t("8:30 AM"), "planned",
  [R(1, "8:30 AM"), R(2, "8 :30 AM")])
C("c_meeting_purpose", "ent_iep_meeting", "meeting_purpose", None, None,
  t("Review Current IEP"), "planned",
  [R(1, "X Review CwTent IEP", page_text="X Review Current IEP",
     mark="'X' marks Review Current IEP; no other purpose is marked")])
C("c_invitation_date_sent", "ent_iep_meeting", "invitation_date_sent", None, None,
  d("2012-01-12"), "observed",
  [R(1, "Date Sent to Participants: 01 /12/201 2")], occurredOn="2012-01-12")
C("c_safeguards_with_invitation", "ent_student", "procedural_safeguards_notice_provided",
  "with meeting invitation", None, b(True), "observed",
  [R(1, "Notice ofProcedural Saf eguards f or Special Education Students and Their Families "
        "has been provided to parents.")])
C("c_contact_phone", "ent_iep_meeting", "meeting_contact_response", "phone", None,
  t("Can Attend"), "observed",
  [R(2, "Phone 01/11/2012 01/11/2012 Can Attend")], occurredOn="2012-01-11")
C("c_contact_letter", "ent_iep_meeting", "meeting_contact_response", "letter", None,
  t("Can Attend"), "observed",
  [R(2, "Leth. •1· 01/12/2012 Can Attend", page_text="Letter 01/12/2012 01/12/2012 Can Attend")],
  occurredOn="2012-01-12")

# ====================================================================== p3: cover page
C("c_meeting_held_date", "ent_iep_meeting", "meeting_date", "held", None,
  d("2012-01-17"), "observed",
  [R(3, "Date of Plan meeting 01 /17/2012"),
   R(4, "Meeting Date: 01/17/2012"),
   R(5, "Meeting Date: 01/17/2012"),
   R(6, "Meeting Date: 01 /17/2012"),
   R(7, "Meeting Date: 01/1 7/201 2"),
   R(8, "Meeting Date: 01/17/2012"),
   R(11, "Meeting Date: 01/17/2012"),
   R(13, "Meeting Date: 01 /17/2012")],
  occurredOn="2012-01-17")
C("c_iep_date", "ent_student", "iep_date", None, None, d("2012-01-17"), "decided",
  [R(3, "IEP Date: ..... 0 '\"\"' 1 .._ /1 ,....7 '\"\" /= 2= 0.... 12",
     page_text="IEP Date: 01/17/2012")])
C("c_grade", "ent_student", "grade", None, None, t("09"), "observed",
  [R(3, "Grade: 09")])
C("c_age", "ent_student", "age", None, None, q(15, "years"), "observed",
  [R(3, "Age* :...1§.", page_text="Age* 15")])
C("c_disability", "ent_student", "disability_category", None, None,
  t("Emotional Behavioral Disability"), "decided",
  [R(3, "Disability (if identified): ..... E =m ......_ ot .._ io ...n .... a .... l..... B ... e "
        "\"\"\" h = a '\"\"' v\"\"' io \"\"\" ra =I ....D ...i = s= a= bi = li..,. ty_",
     page_text="Disability (if identified): Emotional Behavioral Disability")])
C("c_primary_language", "ent_student", "primary_language_at_home", None, None, t("English"),
  "observed",
  [R(3, "Primary language at home: ... E =n .... g.,. l= is \"\"' h...______",
     page_text="Primary language at home: English")])
C("c_surrogate_parent", "ent_student", "surrogate_parent", None, None, b(False), "observed",
  [R(3, "Swrngate parent: 0 Yes lx ]No", page_text="Surrogate parent: [ ] Yes [X] No",
     mark="No is marked; Yes is not")])
C("c_neighborhood_school", "ent_student", "attends_neighborhood_school", None, None, b(False),
  "observed",
  [R(3, "Is this student's neighborhood school?", mark="No is marked; Yes is not")])
C("c_recent_evaluation_date", "ent_student", "evaluation_date", "most recent evaluation", None,
  d("2012-01-11"), "observed",
  [R(3, "Most recent evaluation date 01 /11/2012")], occurredOn="2012-01-11")
C("c_reevaluation_due", "ent_student", "reevaluation_due", None,
  "must occur before this date", d("2015-01-11"), "required",
  [R(3, "Next re-evaluation must occur before this date 01 /11/2015")])
C("c_plan_period", "ent_student", "iep_plan_period", None, None,
  per("2012-01-17", "2013-01-11"), "decided",
  [R(3, "Plan staitdate 01 /17/2012", page_text="Plan start date 01/17/2012"),
   R(3, "Plan end date 01 /11/2013")])
C("c_parent_notified_date", "ent_parent", "notified_of_plan_meeting", None, None,
  d("2012-01-12"), "observed",
  [R(3, "Date parent notified of Plan meeting 01 /12/2012")], occurredOn="2012-01-12")
C("c_primary_staff_contact", "ent_student", "primary_staff_contact", None, None,
  e("ent_primary_staff_contact"), "decided",
  [R(3, "Primaiy Staff Contact: - SC Structured Learning Teacher",
     page_text="Primary Staff Contact: [redacted] SC Structured Learning Teacher")])
for cid, ent, quote in [
    ("c_participated_family_therapist", "ent_family_therapist", "Family Therapist"),
    ("c_participated_gen_ed_teacher", "ent_gen_ed_teacher", "General Education Teacher"),
    ("c_participated_parent", "ent_parent", "Parent Psychologist Special Education Teacher"),
    ("c_participated_psychologist", "ent_psychologist", "Parent Psychologist Special Education Teacher"),
    ("c_participated_sped_teacher", "ent_sped_teacher", "Parent Psychologist Special Education Teacher"),
]:
    C(cid, ent, "plan_participation", "development of this Plan and the placement decision", None,
      b(True), "observed", [R(3, PARTICIPANT_HEADER), R(3, quote)])
C("c_rights_at_18_informed", "ent_student", "informed_of_rights_transfer_at_18", None, None,
  d("2012-01-17"), "observed", [R(3, "Date informed: 01/17/2012")], occurredOn="2012-01-17")
C("c_projected_exit", "ent_student", "projected_graduation_exit_date", None, None,
  d("2015-06-20"), "planned",
  [R(3, "Projected Graduation/Exit Date: 06/20/2015"),
   R(7, "Projected Graduation / Exit Date: 06/20/2015")])

# ====================================================================== p4: team considerations
C("c_strength_work_quality", "ent_student", "strength", None, "when motivated",
  t("works hard and does quality work"), "observed",
  [R(4, "works hard and does quality work")])
C("c_strength_creative", "ent_student", "strength", None, None, t("is creative"), "observed",
  [R(4, "is creative and has a good sense of")])
C("c_hspe_plan", "ent_student", "state_assessment", "HSPE", None,
  t("will be taking the HSPE exam his sophomore year"), "planned",
  [R(4, "will be taking the HSPE exam his sophomore year.")])
C("c_communication_needs", "ent_student", "communication_needs", None, None,
  t("None at this time"), "decided",
  [R(4, "in the student's language and communication mode. None at this time.")])
C("c_assistive_technology", "ent_student", "assistive_technology_needs", None, None,
  t("None at this time"), "decided",
  [R(4, "The student's assistive technology devices and services needs. None at this time.")])
C("c_behavior_strategies", "ent_student", "behavior_supports", None, None,
  t("The Structured Learning team develops interventions to address behavioral deficits"), "planned",
  [R(4, "The Structured Learning team develops interventions to address behavioral deficits.")])
C("c_lep_needs", "ent_student", "limited_english_proficiency_needs", None, None,
  t("None at this time"), "decided",
  [R(4, "relate to the child's IEP. None at this time.")])
C("c_reading_glasses_rx", "ent_student", "vision", "reading glasses prescription", None, b(True),
  "observed", [R(4, "has a prescription for reading glasses.")])
C("c_reading_glasses_school", "ent_student", "vision", "wears reading glasses in school", None,
  b(False), "observed", [R(4, "does not wear reading glasses in school.")])

# ====================================================================== p5: present levels (observed)
C("c_plep_compliance", "ent_student", "compliance_with_staff_requests",
  "after initial refusal to comply", None, q(5, "of 10 opportunities"), "observed",
  [R(5, "initial refusal to comply, he complies with staff 5/10 opportunities.")])
C("c_plep_refusal_pattern", "ent_student", "response_to_staff_requests", None, None,
  t("will almost always say \"no\""), "observed",
  [R(5, "will almost always say \"no\" or shake his")])
C("c_plep_conflict", "ent_student", "resolving_conflict_without_aggression", None, None,
  q(9, "of 10 opportunities"), "observed",
  [R(5, "is currently resolving conflict without aggression 9/10 opportunities.")])
C("c_plep_chair_incidents", "ent_student", "pushed_chair_over_in_frustration", None,
  "this school year", q(2, "occasions"), "observed",
  [R(5, "On two occasions this school year,"), R(5, "pushed a chair over in frustration.")])
C("c_plep_chair_apology", "ent_student", "response_after_incident", None, "on both occasions",
  t("eventually picked the chair up and apologized"), "observed",
  [R(5, "eventually picked the chair up and apologized")])
C("c_plep_group_reluctance", "ent_student", "group_academic_participation", "preference", None,
  t("prefers working independently with staff support"), "observed",
  [R(5, "has been very reluctant to participate in group academic activities. He prefers working "
        "independently with staff support.")])
C("c_plep_group_participation", "ent_student", "group_classroom_participation", None, None,
  q(3, "of 10 opportunities"), "observed",
  [R(5, "participates in group classroom activities 3/1 O opportunities.",
     page_text="participates in group classroom activities 3/10 opportunities.")])
C("c_plep_math_curriculum", "ent_student", "math_curriculum", None, "this year",
  t("6.0 grade math curriculum"), "observed",
  [R(5, "is completing a 6.0 grade math curriculum this year.")])
C("c_plep_calculator", "ent_student", "accuracy", "6.0 calculation problems using a calculator",
  None, q(8, "of 10 opportunities"), "observed",
  [R(5, "He has demonstrated he can use a calculator to solve 6.0"),
   R(5, "problems accurately 8/10 opportunities.")])
C("c_plep_math_fluency", "ent_student", "math_fluency", None, None,
  t("Fluency has not been an issue"), "observed",
  [R(5, "Fluency has not been an issue and the IEP team recommends dropping this measurable skill.")])
C("c_plep_drop_fluency_skill", "ent_student", "math_fluency", "measurable skill", None,
  t("IEP team recommends dropping this measurable skill"), "decided",
  [R(5, "Fluency has not been an issue and the IEP team recommends dropping this measurable skill.")])
C("c_plep_word_problems", "ent_student", "accuracy", "6.0 grade level word problems",
  "independently", q(5, "of 10 opportunities"), "observed",
  [R(5, "has been independently completing 6.0 grade level word problems accurately 5/10 opportunities.")])
C("c_plep_read_aloud", "ent_student", "reading_participation", "whole group reading", None,
  t("refuses to read aloud and rarely follows along"), "observed",
  [R(5, "but he refuses to read aloud and rarely follows along reading the book")])
C("c_plep_reading_rate", "ent_student", "reading_fluency", "6.0 grade level", None,
  q(60, "WCPM"), "observed",
  [R(5, "is currently reading 60 WCPM at the 6.0 grade level.")])
C("c_plep_comprehension", "ent_student", "reading_comprehension_accuracy", "6.0 grade level",
  None, q(75, "%"), "observed",
  [R(5, "is able to answer comprehension questions at the 6.0grade level 75% of the time.")])
C("c_plep_sentences", "ent_student", "sentence_punctuation_capitalization_accuracy",
  "daily reading logs", None, q(80, "%"), "observed",
  [R(5, "is able to write sentences using correct punctuation and capitalization 80% of the time.")])
C("c_plep_paragraph", "ent_student", "paragraph_content_pragmatics_accuracy", None, None,
  q(50, "%"), "observed",
  [R(5, "to complete a paragraph with proper content and pragmatics 50% of the time")])
C("c_plep_writing_support", "ent_student", "writing_support", None, None,
  t("does best with 1:1 support"), "observed",
  [R(5, "does best with 1: 1 support,")])
C("c_plep_assignments", "ent_student", "independent_assignment_completion", None, None,
  q(3, "of 10 opportunities"), "observed",
  [R(5, "independently completes assignments 3/10 opportunities.")])

# ====================================================================== p7: secondary transition
C("c_postsecondary_education", "ent_student", "postsecondary_goal", "education/training", None,
  t("interested in going to college to complete a degree"), "planned",
  [R(7, "is interested in going to college to complete a degree")])
C("c_postsecondary_employment", "ent_student", "postsecondary_goal", "employment", None,
  t("interested in law enforcement"), "planned",
  [R(7, "Content Area: Employment is interested in law enforcement and")])
C("c_course_of_study", "ent_student", "course_of_study", None, None,
  t("comprehensive course of study to meet graduation requirements"), "observed",
  [R(7, "is completing a comprehensive course of study to meet graduation requirements.")])
C("c_agency_linkage", "ent_student", "agency_linkage", None, None,
  t("Not appropriate at this time"), "decided",
  [R(7, "** Not appropriate at this time **")])

# ====================================================================== p8–p10: annual goals
GOALS = [
    # id, label, entity evidence, baseline (value, admin, refs), target (value, admin, refs), date refs
    ("math_calculation", "Annual goal: math calculation with a calculator",
     R(8, "will calculate problems using a calculator improving accuracy from 80% at the 6.0 grade "
          "level to 80% at the 7.0"),
     (q(80, "%"), "6.0 grade level", [R(8, "improving accuracy from 80% at the 6.0 grade level")]),
     (q(80, "%"), "7.0 grade level", [R(8, "to 80% at the 7.0 gra I", page_text="to 80% at the 7.0 grade level")]),
     [R(8, "By 01/11/2013, when given 7.0 calculation")], "classroom assessments"),
    ("math_word_problems", "Annual goal: math word problems",
     R(8, "will independently solve the problem improving accuracy from 50% at the 6.0 grade level "
          "to 80% at the 7.0 grade"),
     (q(50, "%"), "6.0 grade level", [R(8, "improving accuracy from 50% at the 6.0 grade level")]),
     (q(80, "%"), "7.0 grade level", [R(8, "to 80% at the 7.0 grade lev", page_text="to 80% at the 7.0 grade level")]),
     [R(8, "By 01/11/2013, when given 7.0 grade level word problems,")], "classroom assessments"),
    ("reading_fluency", "Annual goal: reading fluency",
     R(8, "will read aloud or silently improving fluency from 60 correct words per minute to 100 "
          "correct words per minute"),
     (q(60, "correct words/minute"), "6.0 grade level text",
      [R(8, "improving fluency from 60 correct words per minute")]),
     (q(100, "correct words/minute"), "6.0 grade level text",
      [R(8, "to 100 correct words per minute")]),
     [R(8, "By 01/11/2013, when given 6.0 grade level")], "classroom assessments"),
    ("reading_comprehension", "Annual goal: reading comprehension",
     R(8, "will answer comprehension questions improving accuracy from 75% at the 6.0 grade level "
          "to 80% at the 7.0 grade"),
     (q(75, "%"), "6.0 grade level", [R(8, "improving accuracy from 75% at the 6.0 grade level")]),
     (q(80, "%"), "7.0 grade level", [R(8, "to 80% at the 7.0 grade le~easured",
                                        page_text="to 80% at the 7.0 grade level as measured")]),
     [R(8, "By 01/11/2013, when given 7.0 grade level", occ=2,
        occ_reason="first occurrence is the word-problems goal; the second opens the comprehension goal")],
     "classroom assessments"),
    ("compliance", "Annual goal: complying with staff directions",
     R(9, "will comply improving success from 50% to 80% of the time as measured by classroom data."),
     (q(50, "%"), None, [R(9, "will comply improving success from 50%")]),
     (q(80, "%"), None, [R(9, "to 80% of the time as measured by classroom data.")]),
     [R(9, "By 01/ 11 /2013, when given a direction from staff,")], "classroom data"),
    ("frustration", "Annual goal: resolving frustration without aggression",
     R(9, "will resolve his feelings without aggression improving success from 90% to 100% of the time."),
     (q(90, "%"), None, [R(9, "without aggression improving success from 90%")]),
     (q(100, "%"), None, [R(9, "to 100% of the time.")]),
     [R(9, "By 01/ 11 /2013, when given a situation that is frustrating,")], "classroom data"),
    ("group_participation", "Annual goal: working with staff and peers in group academic activities",
     R(9, "will appropriately work with staff and peers improving success from 30% to 80% of the time as measured by"),
     (q(30, "%"), None, [R(9, "and peers improving success from 30%")]),
     (q(80, "%"), None, [R(9, "and peers improving success from 30% to 80% of the time")]),
     [R(9, "By 01/ 11 /2013, when given an opportunity to participate in group academic")], "classroom data"),
    ("assignment_completion", "Annual goal: completing academic assignments",
     R(9, "will complete the assignment improving success from 30% to"),
     (q(30, "%"), None, [R(9, "will complete the assignment improving success from 30%")]),
     (q(80, "%"), None, [R(9, "will complete the assignment improving success from 30% to"),
                         R(10, "80% of the time as measured by classroom data.")]),
     [R(9, "By 01/ 11 /2013, when given an academic assignment,")], "classroom data"),
    ("paragraph_writing", "Annual goal: paragraph writing with correct content and pragmatics",
     R(10, "will write a paragraph with sentences that have correct content and pragmatics improving accuracy from 50% to"),
     (q(50, "%"), None, [R(10, "pragmatics improving accuracy from 50%")]),
     None,  # target is under the edge of a redaction box: not reliably readable, not reconstructed
     [R(10, "By 01/ 11 /2013, when given a writing")], "classroom assessments"),
    ("sentence_mechanics", "Annual goal: punctuation and capitalization in reading-log sentences",
     R(10, "will write sentences using correct punctuation and capitalization improving accuracy from 80% to 95% of the"),
     (q(80, "%"), None, [R(10, "capitalization improving accuracy from 80%")]),
     (q(95, "%"), None, [R(10, "from 80% to 95% of the")]),
     [R(10, "By 01/ 11 /2013, when given a daily reading log to complete,")], "classroom assessments"),
]
for gid, label, ent_ref, (bv, badm, brefs), target, date_refs, measured_by in GOALS:
    ent = f"ent_goal_{gid}"
    ENT(ent, "annual_goal", label, [ent_ref])
    C(f"c_goal_{gid}_baseline", ent, "goal_baseline", gid,
      "; ".join(x for x in [badm, f"measured by {measured_by}"] if x), bv, "observed", brefs)
    if target is not None:
        tv, tadm, trefs = target
        C(f"c_goal_{gid}_target", ent, "goal_target", gid,
          "; ".join(x for x in [tadm, f"measured by {measured_by}"] if x), tv, "planned", trefs)
    C(f"c_goal_{gid}_target_date", ent, "goal_target_date", gid, "by", d("2013-01-11"), "planned",
      date_refs)

# ====================================================================== p11: accommodations
ACCOMMODATIONS = [
    ("alt_schedule", "Behaviorally Related: alternative schedule",
     "Behaviorally Related:alternative schedule As needed All settings 01/17/2012 to 01/11/2013"),
    ("breaks", "Behaviorally Related: breaks available when frustration level escalates",
     "Behaviorally Related:breaks available when frustration level escalates As needed All settings 01/17/2012 to 01/11/2013"),
    ("alt_location_anger", "Behaviorally Related: alternative location to resolve anger/frustration",
     "Behaviorally Related:Alternative location to resolve anger/frustration As needed All settings 01/17/2012 to 01/11/2013"),
    ("alt_location_work", "Content Area: alternative location to complete assignments/tests",
     "Content Area:Alternative location to complete assignments/tests As needed All settings 01/17/2012 to 01/11/2013"),
    ("alter_weight", "Grading Modifications: alter weight of class/course tests/exams",
     "Grading Modifications:alter weight of class/course tests/exams As needed All settings 01/17/2012 to 01/11/2013"),
    ("modified_assignments", "Grading Modifications: modified assignments for length and/or content",
     "Grading Modifications:modified assignments for length and/or content As needed All settings 01/17/2012 to 01/11/2013"),
    ("extended_time", "Grading Modifications: extended time without penalty if working appropriately",
     "Grading Modifications:Extended time to complete assignments/tests/projects without penalty if working appropriately As needed All settings 01/17/2012 to 01 /11/2013"),
    ("writing_tools", "Testing Response: dictionary/thesaurus, spell check and word prediction for writing",
     "Testing Response:For Writing : Students may use a print or electronic dictionary or thesaurus, spell check and word prediction software with topic specific dictionaries disabled. As needed All settings 01 /17/2012 to 01 /11/2013"),
    ("math_tools", "Testing Response: mathematics manipulatives and calculator",
     "Testing Response:Mathematics manipulatives and calculator As needed All settings 01 /17/2012 to 01 /11/2013"),
]
for aid, label, row in ACCOMMODATIONS:
    ent = f"ent_accom_{aid}"
    ENT(ent, "accommodation", label, [R(11, row)])
    C(f"c_accom_{aid}_frequency", ent, "accommodation_frequency", aid, None, t("As needed"), "planned",
      [R(11, row)])
    C(f"c_accom_{aid}_location", ent, "accommodation_location", aid, None, t("All settings"), "planned",
      [R(11, row)])
    C(f"c_accom_{aid}_period", ent, "accommodation_duration", aid, None,
      per("2012-01-17", "2013-01-11"), "planned", [R(11, row)])

# ====================================================================== p12: state/district assessments
WRITING_TOOLS = ("For Writing : Students may use a print or electronic dictionary or thesaurus, spell "
                 "check and word prediction software with topic speci fic dictionaries disabled.")
HSPE = [
    ("math_l2", "HSPE Math Prof. Lvl. 2", "M ath Prof. Lvl. 2 X X", True,
     ("Mathematics manipulatives and calculator", "M ath Prof. Lvl. 2 X X M athematics manipulatives and calculator")),
    ("math_l3", "HSPE Math Prof. Lvl. 3", "M ath Prof. Lvl. 3 X", False, None),
    ("reading_l2", "HSPE Reading Prof. Lvl. 2", "Reading Prof. Lvl. 2 X X", True,
     ("For Writing: Students may use a print or electronic dictionary or thesaurus, spell check and word prediction software with topic specific dictionaries disabled.",
      "Reading Prof. Lvl. 2 X X " + WRITING_TOOLS)),
    ("reading_l3", "HSPE Reading Prof. Lvl. 3", "Reading Prof. Lvl. 3 X", False, None),
    ("science_l2", "HSPE Science Prof. Lvl. 2", "Science Prof. L vl. 2 X X", True,
     ("For Writing: Students may use a print or electronic dictionary or thesaurus, spell check and word prediction software with topic specific dictionaries disabled.; Mathematics manipulatives and calculator",
      "Science Prof. L vl. 2 X X " + WRITING_TOOLS + ", M athematics manipulatives and calculator")),
    ("science_l3", "HSPE Science Prof. Lvl. 3", "Science Prof. L vl. 3 X", False, None),
    ("writing_l2", "HSPE Writing Prof. Lvl. 2", "Writing Prof. Lvl. 2 X X", True,
     ("For Writing: Students may use a print or electronic dictionary or thesaurus, spell check and word prediction software with topic specific dictionaries disabled.",
      "Writing Prof. Lvl. 2 X X " + WRITING_TOOLS)),
    ("writing_l3", "HSPE Writing Prof. Lvl. 3", "Writing Prof. Lvl. 3 X", False, None),
]
for hid, task, row_quote, takes, accom in HSPE:
    mark = ("'X' under Participation Yes and Accommodations/Modifications Yes" if takes
            else "'X' under Participation No")
    C(f"c_assess_{hid}_participation", "ent_student", "state_assessment_participation", task, None,
      b(takes), "decided", [R(12, row_quote, mark=mark)])
    if accom:
        C(f"c_assess_{hid}_accommodations", "ent_student", "state_assessment_accommodations", task, None,
          t(accom[0]), "decided", [R(12, accom[1], mark=mark)])
C("c_assess_waas", "ent_student", "state_assessment_participation",
  "WAAS Portfolio (Math, Reading, Science, Writing)", None, b(False), "decided",
  [R(12, "WAAS Po1·tf0Iio M ath X Reading X Science X Writing X",
     page_text="WAAS Portfolio Math X Reading X Science X Writing X",
     mark="each 'X' is under Participation No")])
C("c_assess_local", "ent_student", "state_assessment_participation",
  "Locally-Determined Assessment (Math, Reading, Writing)", None, b(False), "decided",
  [R(12, "Locallv-Determined A ssessment M ath X Reading X Writing X",
     page_text="Locally-Determined Assessment Math X Reading X Writing X",
     mark="each 'X' is under Participation No")])

# ====================================================================== p13: services
SERVICES = [
    ("math", "Special education service: Math",
     "No Math SLC Structured 40 Mittutes / 1 Times Special Education 01/17/2012 01/11/2013 Tchr!Paraeducator Learning Daily Tchr",
     "No Math SLC Structured 40 Minutes / 1 Times Special Education 01/17/2012 01/11/2013 Tchr/Paraeducator Learning Daily Tchr",
     40, 1),
    ("reading", "Special education service: Reading",
     "No Readittg SLC Structured 40 Mittutes / 1 Times Special Education 01/17/2012 01/11/2013 Tchr!Paraeducator Learning Daily Tchr",
     "No Reading SLC Structured 40 Minutes / 1 Times Special Education 01/17/2012 01/11/2013 Tchr/Paraeducator Learning Daily Tchr",
     40, 1),
    ("writing", "Special education service: Writing",
     "No Writittg SLC Structured 40 Mittutes / 1 Times Special Education 01/17/2012 01/11/2013 Tchr!Paraeducator Learning Daily Tchr",
     "No Writing SLC Structured 40 Minutes / 1 Times Special Education 01/17/2012 01/11/2013 Tchr/Paraeducator Learning Daily Tchr",
     40, 1),
    ("social_emotional_behavioral", "Special education service: Social/Emotional/Behavioral",
     "No Social/Emotio nal/Behaviora 1 SLC Tchr!Paraeducator Structured Learning Tchr 15 Mittutes / 3 Times Daily Special Education 01/17/2012 01/11/2013",
     "No Social/Emotio nal/Behaviora l SLC Tchr/Paraeducator Structured Learning Tchr 15 Minutes / 3 Times Daily Special Education 01/17/2012 01/11/2013",
     15, 3),
    ("study_skills", "Special education service: Study Skills",
     "No Study Skills SLC Structured 5 Mitmtes / 3 Times Daily Special Education 01/17/20 12 01/11/2013 Tchr!Paraeducator Learning Tchr",
     "No Study Skills SLC Structured 5 Minutes / 3 Times Daily Special Education 01/17/2012 01/11/2013 Tchr/Paraeducator Learning Tchr",
     5, 3),
]
for sid, label, row, page_text, minutes, times in SERVICES:
    ent = f"ent_service_{sid}"
    ENT(ent, "service", label, [R(13, row, page_text=page_text)])
    rr = lambda: [R(13, row, page_text=page_text)]
    C(f"c_service_{sid}_concurrent", ent, "service_concurrent", sid, None, b(False), "planned", rr())
    C(f"c_service_{sid}_provider", ent, "service_provider", sid, None, t("SLC Tchr/Paraeducator"),
      "planned", rr())
    C(f"c_service_{sid}_monitor", ent, "service_monitor", sid, None, t("Structured Learning Tchr"),
      "planned", rr())
    C(f"c_service_{sid}_session_length", ent, "service_session_length", sid, None, q(minutes, "min"),
      "planned", rr())
    C(f"c_service_{sid}_frequency", ent, "service_frequency", sid, None, q(times, "times/day"),
      "planned", rr())
    C(f"c_service_{sid}_location", ent, "service_location", sid, None, t("Special Education"),
      "planned", rr())
    C(f"c_service_{sid}_period", ent, "service_period", sid, None, per("2012-01-17", "2013-01-11"),
      "planned", rr())
C("c_minutes_in_school", "ent_student", "school_minutes_per_week", None, None, q(1000, "min/week"),
  "planned", [R(13, "Total minutes per week student spends in school: 1000 minutes per week")],
  period=PLAN_PERIOD)
C("c_minutes_sped_setting", "ent_student", "special_education_setting_minutes_per_week", None, None,
  q(900, "min/week"), "planned",
  [R(13, "Total minutes per week student is served in a special education setting: 900 minutes per week")],
  period=PLAN_PERIOD)
C("c_percent_gen_ed", "ent_student", "percent_time_general_education_setting", None, None,
  q(10, "%"), "planned",
  [R(13, "Percent of time in general education setting: 10% in General Education Setting")],
  period=PLAN_PERIOD)

# ====================================================================== p14: placement (LRE)
REJECT_HDR = R(14, "Academic benefit cannot be satisfactorily achieved")
C("c_lre_selected", "ent_student", "lre_placement", "selected", None, t("0-39% in Regular Class"),
  "decided",
  [R(14, "0-39% in Reaular Class X X", page_text="0-39% in Regular Class X X",
     mark="'X' under Considered and under Selected"),
   R(14, "Setting 1: 01/17/2012 - 01/11/2013")], period=PLAN_PERIOD)
C("c_lre_rejected_80_100", "ent_student", "lre_option_rejected", "80%-100% in Regular Class", None,
  t("Academic benefit cannot be satisfactorily achieved"), "decided",
  [R(14, "80%-100% in Reaular Class X X", page_text="80%-100% in Regular Class X X",
     mark="'X' under Considered and under 'Academic benefit cannot be satisfactorily achieved'"),
   REJECT_HDR])
C("c_lre_rejected_40_79", "ent_student", "lre_option_rejected", "40%-79% in Regular Class", None,
  t("Academic benefit cannot be satisfactorily achieved"), "decided",
  [R(14, "40%-79% in Reaular Class X X", page_text="40%-79% in Regular Class X X",
     mark="'X' under Considered and under 'Academic benefit cannot be satisfactorily achieved'"),
   R(14, "Academic benefit cannot be satisfactorily achieved")])
C("c_lre_explanation", "ent_student", "lre_explanation", None, None,
  t("placement in Structured Learning with integration into the general education setting"), "decided",
  [R(14, "The IEP team recommends placement in Structured Learning with integration into the general education setting.")])
C("c_neighborhood_school_explanation", "ent_student", "neighborhood_school_explanation", None, None,
  t("Placement in a specialized program"), "decided",
  [R(14, "Neighborhood School Explanation: Placement in a specialized program.")])
C("c_transportation", "ent_student", "transportation", None, None, t("Regular"), "decided",
  [R(14, "1. Transpo1 ·tation: (K] Regular", page_text="1. Transportation: [X] Regular",
     mark="Regular is marked; Special is not")])
C("c_esy", "ent_student", "extended_school_year", None, None, b(False), "decided",
  [R(14, "Extended School Year:", mark="No is marked; Yes is not")])
C("c_general_pe", "ent_student", "general_pe", None, None, b(True), "decided",
  [R(14, "General PE:", mark="Yes is marked; No is not")])

# ====================================================================== p15: prior written notice
C("c_pwn_date", "ent_student", "prior_written_notice_date", None, None, d("2012-01-17"), "observed",
  [R(15, "Prior Written Notice Date: 01/17/2012")], occurredOn="2012-01-17")
C("c_pwn_action", "ent_student", "prior_written_notice_proposed_action", None, None,
  t("Review of the annual Individualized Education Plan"), "planned",
  [R(15, "Description of the proposed or refused action: Review of the annual Individualized Education Plan .")])
C("c_pwn_reason", "ent_student", "prior_written_notice_reason", None, None, t("Required by law"),
  "observed", [R(15, "Required by law.")])
C("c_pwn_other_options", "ent_student", "prior_written_notice_other_options", None, None,
  t("None at this time"), "observed",
  [R(15, "Description of any other options considered and rejected: None at this time.")])
C("c_pwn_basis", "ent_student", "prior_written_notice_basis", None, None,
  t("Review of academic and behavioral history"), "observed",
  [R(15, "Review of academic and behavioral history.")])
C("c_half_day_schedule", "ent_student", "school_day_schedule", None, "at this time",
  t("half-day schedule"), "observed", [R(15, "is on a half-day schedule.")])
C("c_full_day_struggle", "ent_student", "full_day_schedule_response", None, None,
  t("has struggled behaviorally when trying to complete a full-day schedule"), "observed",
  [R(15, "has struggled behaviorally when trying to complete a full-day schedule.")])
C("c_assess_longer_day", "ent_student", "longer_school_day_readiness", "continue to assess", None,
  t("continue to assess ability to successfully complete a longer school day"), "planned",
  [R(15, "continue to assess"), R(15, "to successfully complete a longer school day.")])
C("c_gradual_increase", "ent_student", "school_day_length", "gradual increase", None,
  t("gradual increase in school day as he demonstrates he can be successful"), "planned",
  [R(15, "The IEP team recommends a gradual increase in"),
   R(15, "day as he demonstrates he can be successful.")])
C("c_safeguards_with_pwn", "ent_student", "procedural_safeguards_notice_provided",
  "with prior written notice", None, b(True), "observed",
  [R(15, "Notice ofProcedural Saf eguards f or Special Education Students and Their Families has "
         "been provided to parents/guardians.")])

# ====================================================================== missing information
def GAP(gid, desc, kind, subj, construct, refs):
    GAPS.append({
        "id": gid, "description": desc, "gapKind": kind, "subjectEntityId": subj,
        "relatedConstruct": construct,
        "evidenceRefs": finalize_refs(gid, refs) if refs else None,
        "proposalLineage": {"proposalItemId": gid, "studyRunId": f"golden-{CASE}"},
    })


GAP("mi_student_notified_blank",
    "The cover page has a field for the date the student was notified of the plan meeting "
    "(\"if transition will be discussed\"). It is blank. The same IEP contains a Secondary "
    "Transition page with post-secondary goals.",
    "field_present_but_empty", "ent_student", "student_notified_of_plan_meeting",
    [R(3, "Date student notified of Plan meeting (if transition will be discussed)")])
GAP("mi_transition_services_blank",
    "Under both post-secondary goals (Education/Training and Employment) the Transition Services "
    "and Staff / Agency Responsible cells are blank.",
    "field_present_but_empty", "ent_student", "transition_services",
    [R(7, "Transition Senices I Starr/ Agency Responsible",
       page_text="Transition Services | Staff / Agency Responsible"),
     R(7, "Transition Senices Starr / Agency Responsible",
       page_text="Transition Services Staff / Agency Responsible")])
GAP("mi_progress_report_method_blank",
    "For each of the ten annual goals, \"How will progress toward this goal be reported? (check all "
    "that apply)\" has one option, Written Progress Report, and it is not marked. How often progress "
    "is reported is marked for each goal.",
    "field_present_but_empty", "ent_student", "progress_report_method",
    [R(8, "How will progress toward this goal be reported? (check all that apply)",
       mark="the only option, Written Progress Report, is not marked (all three goals on this page)"),
     R(9, "How will progress toward this goal be reported? (check all that apply)",
       mark="not marked for any goal on this page"),
     R(10, "How will progress toward this goal be reported? (check all that apply)",
       mark="not marked for any goal on this page")])
GAP("mi_pwn_initiation_date_blank",
    "The prior written notice line \"The action will be initiated on:\" is blank.",
    "field_present_but_empty", "ent_student", "prior_written_notice_initiation_date",
    [R(15, "The action will be initiated on:______________")])

# ====================================================================== integrity checks
ids = [c["id"] for c in CLAIMS] + [x["id"] for x in ENTITIES] + [g["id"] for g in GAPS]
assert len(ids) == len(set(ids)), "duplicate ids"
for c in CLAIMS:
    assert c["subjectEntityId"] in ENT_IDS, c["id"]
    if c["value"]["kind"] == "entity_ref":
        assert c["value"]["entityId"] in ENT_IDS, c["id"]
    assert c["evidenceRefs"], c["id"]
    assert c["modality"] in {"planned", "required", "decided", "observed", "unknown"}, c["id"]

voice_ref = lambda owner, page, quote: finalize_refs(owner, [R(page, quote)])
proposal = {
    "schemaVersion": "canonical-study-proposal/4",
    "domainId": "iep",
    "entities": ENTITIES,
    "claims": CLAIMS,
    "conflicts": [],
    "missingInformation": GAPS,
    "voiceProposal": {
        "subject": {"value": None, "from": None, "evidenceRefs": None},
        "eventNoun": {"value": None, "from": None, "evidenceRefs": None},
        "helperNoun": {"value": None, "from": None, "evidenceRefs": None},
        "otherPartyNoun": {"value": "the school district", "from": "document",
                           "evidenceRefs": voice_ref("voice_other_party", 15,
                                                     "the school district is required to provide you with prior written notice")},
        "subjectName": {"value": None, "from": None, "evidenceRefs": None},
    },
    "modelMetadata": {"providerId": "golden-reference", "modelId": "claude-opus-5-5",
                      "proposalMode": "fixture"},
    "proposedAt": "2026-10-07T00:00:00.000Z",
}

os.makedirs(OUT, exist_ok=True)
json.dump(proposal, open(os.path.join(OUT, f"{CASE}-golden.v4.json"), "w"), indent=2, ensure_ascii=False)
json.dump({"caseId": CASE,
           "wordLayer": {"documentId": PDF, "sourcePdfSha256": PDF_SHA256,
                         "producedBy": "extractNativeWords via engine/core/scripts/shadow-golden/ensure-document-pages.ts",
                         "committed": False},
           "sourceIds": FILE_OF, "refs": EVIDENCE_INDEX},
          open(os.path.join(OUT, f"{CASE}-golden.evidence-index.json"), "w"), indent=2, ensure_ascii=False)

differs = [r for r in EVIDENCE_INDEX if not r["layerMatchesPage"]]
marks = [r for r in EVIDENCE_INDEX if r["valueFromMark"]]
amb = [r for r in EVIDENCE_INDEX if r["occurrencesOnPage"] > 1]
print(f"entities={len(ENTITIES)} claims={len(CLAIMS)} conflicts=0 gaps={len(GAPS)} refs={len(EVIDENCE_INDEX)}")
print(f"refs found in word layer: {len(EVIDENCE_INDEX)}/{len(EVIDENCE_INDEX)}")
print(f"refs where layer text differs from the printed page: {len(differs)} "
      f"(owners: {len({r['owner'] for r in differs})})")
print(f"refs whose value depends on a mark: {len(marks)}")
print(f"refs whose quote occurs more than once on its page: {len(amb)}")
for r in amb:
    print("  ", r["evidenceRefId"], "p", r["page"], repr(r["quote"][:60]), "x", r["occurrencesOnPage"],
          "used", r["occurrenceUsed"])
