"""Build the independent L001 golden reference (canonical-study-proposal/4).

Every quote is checked against the committed verbatim word layer
(engine/intake/fixtures/l001/document-pages) as a run of consecutive words
on the cited page. Any mismatch aborts the build.
"""
import json, sys, os

REPO = sys.argv[1]
OUT = sys.argv[2]
PAGES_DIR = os.path.join(REPO, "engine/intake/fixtures/l001/document-pages")

FILES = [
    "01_initial_referral", "02_evaluation_plan", "03_parent_evaluation_consent",
    "04_psychoeducational_evaluation", "05_academic_evaluation",
    "06_speech_language_evaluation", "07_eligibility_determination", "08_initial_iep",
]
SRC = {i + 1: f"l001-src-{i + 1}" for i in range(len(FILES))}
FILE_OF = {f"l001-src-{i + 1}": FILES[i] + ".pdf" for i in range(len(FILES))}

WORDS = {}
for i, f in enumerate(FILES):
    d = json.load(open(os.path.join(PAGES_DIR, f + ".json")))["documentPages"]
    for p in d["pages"]:
        ws = sorted(p["words"], key=lambda w: w["seq"])
        WORDS[(i + 1, p["pageNumber"])] = [(w["seq"], w["text"]) for w in ws]


def locate(doc, page, quote):
    toks = quote.split()
    words = WORDS[(doc, page)]
    hits = []
    for s in range(len(words) - len(toks) + 1):
        if all(words[s + k][1] == toks[k] for k in range(len(toks))):
            hits.append((words[s][0], words[s + len(toks) - 1][0]))
    if not hits:
        raise SystemExit(f"QUOTE NOT FOUND doc={doc} page={page}: {quote!r}")
    return hits


EVIDENCE_INDEX = []
_ref_counter = {}


def R(doc, page, quote):
    hits = locate(doc, page, quote)
    return {"_doc": doc, "_page": page, "_quote": quote, "_hits": hits}


def finalize_refs(owner, refs):
    out = []
    for n, r in enumerate(refs, 1):
        rid = f"ev_{owner}_{n}"
        out.append({
            "id": rid,
            "sourceDocumentId": SRC[r["_doc"]],
            "logicalDocumentId": None,
            "page": r["_page"],
            "pageEnd": None,
            "spanStart": None,
            "spanEnd": None,
            "quote": r["_quote"],
            "extractionId": None,
            "sourceType": "document",
        })
        EVIDENCE_INDEX.append({
            "evidenceRefId": rid,
            "owner": owner,
            "sourceDocumentId": SRC[r["_doc"]],
            "documentId": FILE_OF[SRC[r["_doc"]]],
            "page": r["_page"],
            "wordRange": {"startSeq": r["_hits"][0][0], "endSeq": r["_hits"][0][1]},
            "occurrencesOnPage": len(r["_hits"]),
            "quote": r["_quote"],
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
cd = lambda s: V("code", codeValue=s)
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


IEP_PERIOD = {"start": "2024-11-12", "end": "2025-11-11", "precision": "day"}


def C(cid, subj, measure, task, admin, value, modality, refs,
      occurredOn=None, period=None):
    unit = value["unit"] if value["kind"] == "quantity" else None
    CLAIMS.append({
        "id": cid, "subjectEntityId": subj,
        "construct": {"measure": measure, "task": task, "administration": admin},
        "value": value, "unit": unit, "modality": modality,
        "effectivePeriod": period, "occurredOn": occurredOn,
        "evidenceRefs": finalize_refs(cid, refs),
    })


# ---------------------------------------------------------------- entities
ENT("ent_student", "student", "Maya Carter",
    [R(i, 1, "Student: Maya Carter") for i in range(1, 9)] + [R(1, 1, "Maya has difficulty reading")],
    aliases=["Maya"])
ENT("ent_school", "school", "Synthetic Elementary School",
    [R(i, 1, "School: Synthetic Elementary School") for i in range(1, 9)])
ENT("ent_district", "school_district", "Synthetic District",
    [R(i, 1, "District: Synthetic District") for i in range(1, 9)] + [R(2, 1, "Prepared By: District")])
ENT("ent_referral", "referral", "Referral for Special Education Evaluation",
    [R(1, 1, "Referral for Special Education Evaluation")])
ENT("ent_eval_plan", "evaluation_plan", "Special Education Evaluation Plan",
    [R(2, 1, "Special Education Evaluation Plan")])
ENT("ent_consent", "consent", "Parent Consent for Initial Special Education Evaluation",
    [R(3, 1, "Parent Consent for Initial Special Education Evaluation")])
ENT("ent_psych_eval", "evaluation", "Psychoeducational Evaluation Report (2024-10-15)",
    [R(4, 1, "Psychoeducational Evaluation Report"),
     R(7, 1, "[X] Psychoeducational Evaluation - 2024-10-15")])
ENT("ent_academic_eval", "evaluation", "Academic Evaluation Report (2024-10-18)",
    [R(5, 1, "Academic Evaluation Report"),
     R(7, 1, "[X] Academic Evaluation - 2024-10-18"),
     R(8, 1, "The academic evaluation dated 2024-10-18")])
ENT("ent_slp_eval", "evaluation", "Speech-Language Evaluation Report (2024-10-22)",
    [R(6, 1, "Speech-Language Evaluation Report"),
     R(7, 1, "[X] Speech-Language Evaluation - 2024-10-22")])
ENT("ent_eligibility", "eligibility_determination", "Initial Eligibility Determination (2024-11-01)",
    [R(7, 1, "Determination Type: Initial Eligibility Determination"),
     R(8, 1, "Determination Date: 2024-11-01")])
ENT("ent_iep", "iep", "Initial Individualized Education Program (2024-11-12)",
    [R(8, 1, "Initial Individualized Education Program (IEP)"),
     R(8, 3, "This initial IEP addresses Reading Fluency for Maya Carter.")])
ENT("ent_goal_reading_fluency", "annual_goal", "GOAL_READING_FLUENCY",
    [R(8, 1, "Goal ID: GOAL_READING_FLUENCY")])
ENT("ent_service_reading", "service", "Specialized reading instruction",
    [R(8, 2, "Specialized reading instruction Weekly 150 minutes special education setting 2024-11-12")])

# ---------------------------------------------------------------- student identity
C("clm_student_dob", "ent_student", "date_of_birth", None, None, d("2017-04-18"), "observed",
  [R(i, 1, "Date of Birth: 2017-04-18") for i in range(1, 9)])
C("clm_student_grade", "ent_student", "grade_level", None, None, cd("2"), "observed",
  [R(i, 1, "Grade: 2") for i in range(1, 9)],
  )
C("clm_student_school", "ent_student", "enrolled_school", None, None, e("ent_school"), "observed",
  [R(i, 1, "School: Synthetic Elementary School") for i in range(1, 9)])
C("clm_student_district", "ent_student", "school_district", None, None, e("ent_district"), "observed",
  [R(i, 1, "District: Synthetic District") for i in range(1, 9)])

# ---------------------------------------------------------------- referral (src-1)
C("clm_referral_date", "ent_referral", "referral_date", None, None, d("2024-08-20"), "observed",
  [R(1, 1, "Referral Date: 2024-08-20")], occurredOn="2024-08-20")
C("clm_referral_student", "ent_referral", "referred_student", None, None, e("ent_student"), "observed",
  [R(1, 1, "Student: Maya Carter")], occurredOn="2024-08-20")
C("clm_referral_by", "ent_referral", "referred_by", None, None, t("Teacher"), "observed",
  [R(1, 1, "Referred By: Teacher")], occurredOn="2024-08-20")
C("clm_referral_area_of_concern", "ent_referral", "area_of_concern", None, None, t("Reading Fluency"), "observed",
  [R(1, 1, "Area of Concern: Reading Fluency"),
   R(2, 1, "The area of concern is reading fluency."),
   R(4, 1, "The primary referral concern remains reading fluency."),
   R(4, 2, "The primary referral concern is reading fluency.")],
  occurredOn="2024-08-20")
for n, (area, quote) in enumerate([
        ("Academic achievement / reading", "• Academic achievement / reading"),
        ("Reading fluency", "• Reading fluency"),
        ("Review of educational performance", "• Review of educational performance")], 1):
    C(f"clm_referral_area_requested_{n}", "ent_referral", "evaluation_area", "requested", None,
      t(area), "observed", [R(1, 1, quote)], occurredOn="2024-08-20")
C("clm_referral_parent_input", "ent_referral", "parent_input", "evaluation_process", None,
  t("will be requested as part of the evaluation process"), "planned",
  [R(1, 1, "Parent input will be requested as part of the evaluation process.")], occurredOn="2024-08-20")
C("clm_referral_next_step", "ent_referral", "next_step", "evaluation_team_review", None,
  t("review existing information and determine the areas requiring further evaluation"), "planned",
  [R(1, 1, "The evaluation team will review existing information and determine the areas requiring further evaluation.")],
  occurredOn="2024-08-20")

# ---------------------------------------------------------------- student reading concern (cross-document)
C("clm_reading_difficulty", "ent_student", "difficulty", "reading_connected_grade_level_text", "accuracy_and_fluency",
  t("difficulty reading connected grade-level text accurately and fluently"), "observed",
  [R(1, 1, "Maya has difficulty reading connected grade-level text accurately and fluently."),
   R(2, 1, "Maya was referred because of persistent difficulty reading connected grade-level text accurately and fluently."),
   R(4, 1, "Maya was referred because of persistent difficulty reading connected grade-level text accurately and fluently."),
   R(5, 1, "Maya has difficulty reading connected grade-level text accurately and fluently,"),
   R(7, 2, "Teacher information and the referral document a persistent classroom difficulty reading connected grade-level text accurately and fluently."),
   R(8, 1, "Maya has difficulty reading connected grade-level text accurately and fluently.")])
C("clm_reading_concern_persistent", "ent_student", "concern_persistence", "reading_fluency", "teacher_information",
  t("persistent"), "observed",
  [R(1, 1, "Classroom performance and teacher observation indicate persistent difficulty reading connected grade-level text accurately and fluently."),
   R(4, 1, "Teacher information indicates that the reading difficulty is persistent in classroom reading tasks involving connected grade-level text."),
   R(4, 2, "Teacher information indicates the reading difficulty is persistent in classroom reading tasks."),
   R(7, 1, "Teacher information documents a persistent classroom reading fluency concern."),
   R(8, 1, "Maya has a persistent reading fluency concern.")])
C("clm_reading_access_impact", "ent_student", "educational_impact", "grade_level_reading_activities", "independent_access",
  t("affects ability to access grade-level reading activities independently"), "observed",
  [R(1, 1, "The concern is affecting Maya's ability to access grade-level reading activities independently."),
   R(8, 1, "This difficulty affects Maya's ability to access grade-level reading activities independently.")])

# ---------------------------------------------------------------- evaluation plan (src-2)
C("clm_plan_date", "ent_eval_plan", "planning_date", None, None, d("2024-08-28"), "observed",
  [R(2, 1, "Planning Date: 2024-08-28")], occurredOn="2024-08-28")
C("clm_plan_prepared_by", "ent_eval_plan", "prepared_by", None, None, t("District"), "observed",
  [R(2, 1, "Prepared By: District")], occurredOn="2024-08-28")
C("clm_plan_type", "ent_eval_plan", "document_type", None, None, t("Initial evaluation plan"), "observed",
  [R(2, 1, "Document Type: Initial evaluation plan")], occurredOn="2024-08-28")
C("clm_plan_responds_to_referral", "ent_eval_plan", "considers_concern_from", None, None, e("ent_referral"), "observed",
  [R(2, 1, "This plan considers the classroom concern described in the initial referral and does not report evaluation results.")],
  occurredOn="2024-08-28")
for n, (item, avail, quote) in enumerate([
        ("Teacher concern regarding reading connected grade-level text", True, "[X] Teacher concern regarding reading connected grade-level text"),
        ("Classroom educational performance related to reading fluency", True, "[X] Classroom educational performance related to reading fluency"),
        ("Initial referral information", True, "[X] Initial referral information"),
        ("Completed evaluation scores", False, "[ ] Completed evaluation scores")], 1):
    C(f"clm_plan_existing_info_{n}", "ent_eval_plan", "information_available",
      item.lower().replace(" ", "_").replace("-", "_"), "as_of_planning_date",
      b(avail), "observed", [R(2, 1, quote)], occurredOn="2024-08-28")
for n, (area, quote) in enumerate([
        ("Academic achievement / reading", "[X] Academic achievement / reading"),
        ("Reading fluency", "[X] Reading fluency"),
        ("Review of educational performance", "[X] Review of educational performance")], 1):
    C(f"clm_plan_area_proposed_{n}", "ent_eval_plan", "evaluation_area", "proposed", None,
      t(area), "planned", [R(2, 1, quote)], occurredOn="2024-08-28")
for n, (item, quote) in enumerate([
        ("Review of existing educational records", "[X] Review of existing educational records"),
        ("Teacher input", "[X] Teacher input"),
        ("Parent input", "[X] Parent input"),
        ("Appropriate assessment of reading performance", "[X] Appropriate assessment of reading performance")], 1):
    C(f"clm_plan_info_to_gather_{n}", "ent_eval_plan", "information_to_gather", None, None,
      t(item), "planned", [R(2, 1, quote)], occurredOn="2024-08-28")
C("clm_plan_consent_required", "ent_eval_plan", "parent_consent", "initial_evaluation", "written_before_evaluation",
  b(True), "required",
  [R(2, 1, "Parent consent is required before the initial evaluation proceeds."),
   R(2, 1, "No evaluation will be conducted until written consent is obtained.")],
  occurredOn="2024-08-28")

# ---------------------------------------------------------------- consent (src-3)
C("clm_consent_given", "ent_consent", "consent_decision", "initial_evaluation", "parent_guardian",
  b(True), "decided",
  [R(3, 1, "[X] I consent to the proposed initial evaluation."),
   R(3, 1, "Date: 2024-09-04")],
  occurredOn="2024-09-04")
C("clm_consent_given_by", "ent_consent", "consent_given_by", "initial_evaluation", None,
  t("parent/guardian"), "observed",
  [R(3, 1, "The parent/guardian gives consent for an initial special-education evaluation in the identified areas below.")],
  occurredOn="2024-09-04")
C("clm_consent_follows_plan", "ent_consent", "responds_to", None, None, e("ent_eval_plan"), "observed",
  [R(3, 1, "[X] I consent to the proposed initial evaluation.")], occurredOn="2024-09-04")
for n, (area, quote) in enumerate([
        ("Academic achievement / reading", "[X] Academic achievement / reading"),
        ("Reading fluency", "[X] Reading fluency"),
        ("Review of educational performance", "[X] Review of educational performance")], 1):
    C(f"clm_consent_area_{n}", "ent_consent", "evaluation_area", "consented", None,
      t(area), "decided", [R(3, 1, quote)], occurredOn="2024-09-04")

# ---------------------------------------------------------------- psychoeducational (src-4)
C("clm_psych_date", "ent_psych_eval", "evaluation_date", None, None, d("2024-10-15"), "observed",
  [R(4, 1, "Evaluation Date: 2024-10-15"),
   R(7, 1, "[X] Psychoeducational Evaluation - 2024-10-15")], occurredOn="2024-10-15")
C("clm_psych_evaluator", "ent_psych_eval", "evaluator_role", None, None, t("School psychologist"), "observed",
  [R(4, 1, "Evaluator: School psychologist")], occurredOn="2024-10-15")
for n, (src, quote) in enumerate([
        ("Initial referral for special education evaluation", "• Initial referral for special education evaluation"),
        ("Teacher information regarding classroom reading tasks", "• Teacher information regarding classroom reading tasks"),
        ("Parent consent for the initial evaluation", "• Parent consent for the initial evaluation"),
        ("Student observation during the evaluation session", "• Student observation during the evaluation session")], 1):
    C(f"clm_psych_source_{n}", "ent_psych_eval", "source_of_information", None, None,
      t(src), "observed", [R(4, 1, quote)], occurredOn="2024-10-15")
C("clm_psych_verbal_directions", "ent_student", "classroom_participation", "classroom_discussion_and_verbal_directions",
  "psychoeducational_evaluation",
  t("participated in classroom discussion and understood ordinary verbal directions"), "observed",
  [R(4, 1, "Maya participated in classroom discussion and understood ordinary verbal directions during the evaluation."),
   R(4, 2, "Maya is able to participate in classroom discussion and understand ordinary verbal directions.")],
  occurredOn="2024-10-15")
C("clm_psych_cooperation", "ent_student", "cooperation_and_engagement", None, "psychoeducational_evaluation",
  t("adequate for completing requested tasks"), "observed",
  [R(4, 1, "Cooperation and engagement were adequate for completing requested tasks.")], occurredOn="2024-10-15")
C("clm_psych_cognitive_range", "ent_student", "general_reasoning_and_cognitive_functioning", None,
  "psychoeducational_evaluation",
  t("broadly within the expected range for age"), "observed",
  [R(4, 2, "General reasoning and cognitive functioning are broadly within the expected range for age."),
   R(7, 1, "Psychoeducational evidence indicates general reasoning and cognitive functioning are broadly within the expected range for age."),
   R(7, 2, "Psychoeducational evidence indicates general reasoning and cognitive functioning are broadly within the expected range for age,")],
  occurredOn="2024-10-15")
C("clm_psych_no_global_cognitive", "ent_student", "global_cognitive_limitation_primary_explanation",
  "reading_fluency_concern", "psychoeducational_evaluation",
  b(False), "observed",
  [R(4, 1, "No observation in this evaluation indicated that a global cognitive limitation is the primary explanation for the reading-fluency concern."),
   R(4, 2, "No global cognitive limitation is identified as the primary explanation for the reading-fluency concern."),
   R(7, 1, "A global cognitive limitation is not identified as the primary explanation."),
   R(7, 2, "a global cognitive limitation is not identified as the primary explanation.")],
  occurredOn="2024-10-15")
C("clm_psych_supports_further_eval", "ent_psych_eval", "interpretation", "continued_educational_evaluation",
  "reading_achievement_and_fluency",
  t("supports continued educational evaluation of reading achievement and fluency"), "observed",
  [R(4, 2, "The psychoeducational information supports continued educational evaluation of Maya's reading achievement and fluency.")],
  occurredOn="2024-10-15")
C("clm_psych_consistent_concern", "ent_psych_eval", "interpretation", "reading_fluency_concern", "classroom_and_teacher_report",
  t("classroom performance and teacher report consistent with a reading-fluency concern"), "observed",
  [R(4, 2, "Classroom performance and teacher report remain consistent with a reading-fluency concern.")],
  occurredOn="2024-10-15")
C("clm_psych_no_category", "ent_psych_eval", "assigns_disability_category", None, None, b(False), "observed",
  [R(4, 2, "This report does not assign a disability category"),
   R(4, 2, "This psychoeducational evaluation does not assign a disability category")],
  occurredOn="2024-10-15")
C("clm_psych_no_sped_conclusion", "ent_psych_eval", "concludes_special_education_required", None, None, b(False), "observed",
  [R(4, 2, "does not conclude that special education services are required.")], occurredOn="2024-10-15")
C("clm_psych_no_minutes", "ent_psych_eval", "recommends_instructional_service_minutes", None, None, b(False), "observed",
  [R(4, 2, "does not recommend instructional service minutes.")], occurredOn="2024-10-15")
C("clm_psych_recommend_academic", "ent_psych_eval", "recommendation", "academic_assessment_of_reading_achievement_and_fluency",
  "before_eligibility",
  t("academic assessment of reading achievement and fluency next, before the team considers eligibility"), "planned",
  [R(4, 2, "Academic assessment of reading achievement and fluency should be completed next, before the team considers eligibility.")],
  occurredOn="2024-10-15")

# ---------------------------------------------------------------- academic (src-5)
C("clm_academic_date", "ent_academic_eval", "evaluation_date", None, None, d("2024-10-18"), "observed",
  [R(5, 1, "Evaluation Date: 2024-10-18"),
   R(5, 1, "This academic evaluation was completed on 2024-10-18"),
   R(7, 1, "[X] Academic Evaluation - 2024-10-18"),
   R(8, 1, "The academic evaluation dated 2024-10-18")], occurredOn="2024-10-18")
C("clm_academic_evaluator", "ent_academic_eval", "evaluator_role", None, None, t("Academic evaluator"), "observed",
  [R(5, 1, "Evaluator: Academic evaluator")], occurredOn="2024-10-18")
C("clm_academic_focus", "ent_academic_eval", "evaluation_focus", None, None,
  t("Reading achievement and oral reading fluency"), "observed",
  [R(5, 1, "Focus: Reading achievement and oral reading fluency")], occurredOn="2024-10-18")
C("clm_orf_wcpm", "ent_student", "oral_reading_fluency", "connected_text_reading", "academic_evaluation",
  q(42, "WCPM"), "observed",
  [R(5, 1, "Oral Reading Fluency 42 WCPM"),
   R(7, 1, "Academic evaluation results include oral reading fluency of 42 WCPM"),
   R(7, 2, "The academic evaluation documents oral reading fluency of 42 WCPM"),
   R(8, 1, "The academic evaluation dated 2024-10-18 documents a reading fluency baseline of 42 WCPM")],
  occurredOn="2024-10-18")
C("clm_orf_accuracy", "ent_student", "oral_reading_accuracy", "connected_text_reading", "academic_evaluation",
  q(86, "%"), "observed",
  [R(5, 1, "Oral Reading Accuracy 86%"),
   R(7, 1, "oral reading accuracy of 86%."),
   R(7, 2, "oral reading accuracy of 86 percent,"),
   R(8, 1, "oral reading accuracy of 86%.")],
  occurredOn="2024-10-18")
C("clm_reading_comprehension", "ent_student", "reading_comprehension", "grade_level_text_tasks", "academic_evaluation",
  t("Below expected classroom level"), "observed",
  [R(5, 1, "Reading Comprehension Below expected classroom level"),
   R(5, 1, "with reading comprehension during grade-level text tasks below expected classroom level."),
   R(7, 1, "Reading comprehension during grade-level text tasks is below expected classroom level."),
   R(7, 2, "with reading comprehension during grade-level text tasks below expected classroom level."),
   R(8, 1, "Reading comprehension during grade-level text tasks is below expected classroom level.")],
  occurredOn="2024-10-18")
C("clm_connected_text_slow", "ent_student", "reading_rate_quality", "connected_text_reading", "academic_evaluation_observation",
  t("slow and effortful"), "observed",
  [R(5, 1, "Connected-text reading is slow and effortful."),
   R(7, 1, "Connected-text reading is slow and effortful, with frequent pauses."),
   R(7, 2, "Connected-text reading is slow and effortful, with frequent pauses."),
   R(8, 1, "Connected-text reading is slow and effortful, with frequent pauses.")],
  occurredOn="2024-10-18")
C("clm_frequent_pauses", "ent_student", "pauses", "connected_text_reading", "academic_evaluation_observation",
  t("frequent pauses"), "observed",
  [R(5, 1, "Frequent pauses were observed."),
   R(7, 1, "with frequent pauses."),
   R(8, 1, "with frequent pauses.")],
  occurredOn="2024-10-18")
C("clm_isolated_word_stronger", "ent_student", "relative_strength", "isolated_word_reading", "compared_to_connected_text_reading",
  t("isolated word reading stronger than connected-text reading"), "observed",
  [R(5, 1, "Isolated word reading is stronger than connected-text reading."),
   R(8, 1, "Isolated word reading is stronger than connected-text reading.")],
  occurredOn="2024-10-18")
C("clm_academic_need", "ent_academic_eval", "educational_need_documented", "reading_fluency", None,
  b(True), "observed",
  [R(5, 1, "The evaluation documents an educational need in reading fluency.")], occurredOn="2024-10-18")
for n, (rec, quote) in enumerate([
        ("explicit systematic reading instruction", "• explicit systematic reading instruction"),
        ("repeated oral reading practice", "• repeated oral reading practice"),
        ("regular progress monitoring", "• regular progress monitoring")], 1):
    C(f"clm_academic_recommendation_{n}", "ent_academic_eval", "recommendation",
      rec.replace(" ", "_"), None, t(rec), "planned",
      [R(5, 1, quote)], occurredOn="2024-10-18")

# ---------------------------------------------------------------- speech-language (src-6)
C("clm_slp_date", "ent_slp_eval", "evaluation_date", None, None, d("2024-10-22"), "observed",
  [R(6, 1, "Evaluation Date: 2024-10-22"),
   R(6, 1, "This speech-language evaluation was completed on 2024-10-22"),
   R(7, 1, "[X] Speech-Language Evaluation - 2024-10-22")], occurredOn="2024-10-22")
C("clm_slp_evaluator", "ent_slp_eval", "evaluator_role", None, None, t("Speech-language pathologist"), "observed",
  [R(6, 1, "Evaluator: Speech-language pathologist")], occurredOn="2024-10-22")
C("clm_slp_purpose", "ent_slp_eval", "evaluation_purpose", "separate_speech_language_need", None,
  t("determine whether a separate speech-language educational need is present"), "observed",
  [R(6, 1, "The purpose is to determine whether a separate speech-language educational need is present.")],
  occurredOn="2024-10-22")
C("clm_slp_intelligibility", "ent_student", "speech_intelligibility", "classroom_participation", "speech_language_evaluation",
  t("adequate for classroom participation"), "observed",
  [R(6, 1, "Speech intelligibility is adequate for classroom participation.")], occurredOn="2024-10-22")
C("clm_slp_language", "ent_student", "receptive_and_expressive_language", "classroom_communication", "speech_language_evaluation",
  t("broadly functional for classroom communication"), "observed",
  [R(6, 1, "Receptive and expressive language observed during the evaluation are broadly functional for classroom communication.")],
  occurredOn="2024-10-22")
C("clm_slp_no_impairment", "ent_student", "speech_language_impairment_diagnosed", None, "speech_language_evaluation",
  b(False), "observed",
  [R(6, 1, "No speech-language impairment is diagnosed in this report.")], occurredOn="2024-10-22")
C("clm_slp_no_separate_need", "ent_student", "separate_speech_language_educational_need", None, "speech_language_evaluation",
  b(False), "observed",
  [R(6, 1, "No separate speech-language educational need is identified from this evaluation."),
   R(7, 1, "No separate speech-language educational need is identified from this evaluation."),
   R(7, 2, "The speech-language evaluation identifies no separate speech-language educational need")],
  occurredOn="2024-10-22")
C("clm_slp_no_service", "ent_slp_eval", "recommends_speech_language_service", None, None, b(False), "observed",
  [R(6, 1, "No speech-language service is recommended."),
   R(7, 2, "does not recommend a speech-language service.")], occurredOn="2024-10-22")
C("clm_slp_reading_unresolved", "ent_slp_eval", "reading_concern_resolved", "reading_fluency", None, b(False), "observed",
  [R(6, 1, "The documented reading concern has not been resolved by this evaluation."),
   R(6, 1, "The documented reading-fluency concern remains;")], occurredOn="2024-10-22")
C("clm_slp_no_eligibility", "ent_slp_eval", "determines_eligibility", None, None, b(False), "observed",
  [R(6, 1, "This report does not determine special education eligibility.")], occurredOn="2024-10-22")

# ---------------------------------------------------------------- eligibility (src-7)
C("clm_elig_date", "ent_eligibility", "determination_date", None, None, d("2024-11-01"), "observed",
  [R(7, 1, "Determination Date: 2024-11-01"),
   R(8, 1, "Determination Date: 2024-11-01")], occurredOn="2024-11-01")
C("clm_elig_type", "ent_eligibility", "determination_type", None, None, t("Initial Eligibility Determination"), "observed",
  [R(7, 1, "Determination Type: Initial Eligibility Determination")], occurredOn="2024-11-01")
C("clm_elig_by", "ent_eligibility", "determined_by", None, None, t("Eligibility team"), "observed",
  [R(7, 1, "Determination By: Eligibility team")], occurredOn="2024-11-01")
for n, (ent, quote) in enumerate([
        ("ent_psych_eval", "[X] Psychoeducational Evaluation - 2024-10-15"),
        ("ent_academic_eval", "[X] Academic Evaluation - 2024-10-18"),
        ("ent_slp_eval", "[X] Speech-Language Evaluation - 2024-10-22")], 1):
    C(f"clm_elig_reviewed_{n}", "ent_eligibility", "evaluation_evidence_reviewed", None, None,
      e(ent), "observed", [R(7, 1, quote)], occurredOn="2024-11-01")
C("clm_elig_eligible", "ent_student", "special_education_eligibility", None, "initial_eligibility_determination",
  b(True), "decided",
  [R(7, 1, "[X] Eligible for special education"),
   R(7, 1, "Eligible for special education. This is an educational eligibility determination,")],
  occurredOn="2024-11-01")
C("clm_elig_category", "ent_student", "eligibility_category", None, "initial_eligibility_determination",
  t("Specific Learning Disability (SLD) - Reading"), "decided",
  [R(7, 1, "Eligibility Category: Specific Learning Disability (SLD) - Reading"),
   R(7, 1, "Eligibility category: Specific Learning Disability (SLD) - Reading."),
   R(8, 1, "Eligibility Category: Specific Learning Disability (SLD) - Reading")],
  occurredOn="2024-11-01")
C("clm_elig_primary_need", "ent_student", "primary_educational_need", None, "initial_eligibility_determination",
  t("Reading Fluency"), "decided",
  [R(7, 1, "Primary educational need: Reading Fluency."),
   R(8, 1, "The primary educational need is Reading Fluency.")],
  occurredOn="2024-11-01")
C("clm_elig_not_medical", "ent_eligibility", "is_medical_diagnosis", None, None, b(False), "observed",
  [R(7, 1, "This document records an educational eligibility determination. It is not a medical diagnosis."),
   R(8, 1, "This IEP implements the educational eligibility determination. It is not a medical diagnosis.")],
  occurredOn="2024-11-01")
C("clm_elig_requires_sdi", "ent_student", "requires_specially_designed_instruction", "reading_fluency",
  "initial_eligibility_determination", b(True), "decided",
  [R(7, 1, "The team determined that Maya requires specially designed instruction targeting the documented reading fluency need."),
   R(7, 2, "The team determined that Maya requires specially designed instruction to address the documented reading-fluency need.")],
  occurredOn="2024-11-01")

# ---------------------------------------------------------------- IEP (src-8)
C("clm_iep_date", "ent_iep", "iep_date", None, None, d("2024-11-12"), "observed",
  [R(8, 1, "IEP Date: 2024-11-12"), R(8, 2, "District Representative: [Synthetic signature omitted] Date: 2024-11-12")], occurredOn="2024-11-12")
C("clm_iep_period", "ent_iep", "iep_period", None, None, per("2024-11-12", "2025-11-11"), "planned",
  [R(8, 1, "IEP Period: 2024-11-12 through 2025-11-11")], period=IEP_PERIOD)
C("clm_iep_student", "ent_iep", "iep_for_student", None, None, e("ent_student"), "observed",
  [R(8, 1, "Student: Maya Carter"),
   R(8, 3, "This initial IEP addresses Reading Fluency for Maya Carter.")], occurredOn="2024-11-12")
C("clm_iep_implements_eligibility", "ent_iep", "implements_eligibility_determination", None, None, e("ent_eligibility"), "observed",
  [R(8, 1, "This IEP implements the educational eligibility determination."),
   R(8, 1, "Determination Date: 2024-11-01")], occurredOn="2024-11-12")
C("clm_iep_addresses", "ent_iep", "area_addressed", None, None, t("Reading Fluency"), "planned",
  [R(8, 3, "This initial IEP addresses Reading Fluency for Maya Carter.")], period=IEP_PERIOD)
C("clm_iep_has_goal", "ent_iep", "annual_goal", None, None, e("ent_goal_reading_fluency"), "planned",
  [R(8, 1, "Goal ID: GOAL_READING_FLUENCY")], period=IEP_PERIOD)
C("clm_iep_has_service", "ent_iep", "special_education_service", None, None, e("ent_service_reading"), "planned",
  [R(8, 2, "Specialized reading instruction is provided 150 minutes weekly in the special education setting.")],
  period=IEP_PERIOD)
for n, (acc, quote) in enumerate([
        ("Extended time for classroom reading assessments", "• Extended time for classroom reading assessments."),
        ("Directions read aloud when reading ability is not being assessed", "• Directions read aloud when reading ability is not being assessed.")], 1):
    C(f"clm_iep_accommodation_{n}", "ent_iep", "accommodation", None, None, t(acc), "planned",
      [R(8, 2, quote)], period=IEP_PERIOD)
for n, (role, quote) in enumerate([
        ("Parent/Guardian", "Parent/Guardian: [Synthetic signature omitted]"),
        ("General Education Teacher", "General Education Teacher: [Synthetic signature omitted]"),
        ("Special Education Teacher", "Special Education Teacher: [Synthetic signature omitted]"),
        ("District Representative", "District Representative: [Synthetic signature omitted]")], 1):
    C(f"clm_iep_team_role_{n}", "ent_iep", "team_participant_role", "iep_development", None,
      t(role), "observed", [R(8, 2, quote)], occurredOn="2024-11-12")
C("clm_iep_progress_reporting_frequency", "ent_iep", "progress_reporting_frequency", "annual_goal", None,
  t("quarterly, concurrent with report periods"), "planned",
  [R(8, 2, "reported quarterly, concurrent with report periods.")], period=IEP_PERIOD)
C("clm_iep_progress_reporting_method", "ent_iep", "progress_measurement_method", "annual_goal", None,
  t("oral-reading-fluency probes"), "planned",
  [R(8, 2, "Progress toward the annual goal will be measured using oral-reading-fluency probes")], period=IEP_PERIOD)

# goal
G = "ent_goal_reading_fluency"
C("clm_goal_area", G, "goal_area", None, None, t("Reading Fluency"), "planned",
  [R(8, 3, "This initial IEP addresses Reading Fluency for Maya Carter.")], period=IEP_PERIOD)
C("clm_goal_condition", G, "goal_condition", None, None, t("Given a grade-level connected text passage"), "planned",
  [R(8, 1, "Given a grade-level connected text passage,")], period=IEP_PERIOD)
C("clm_goal_baseline", G, "baseline", "oral_reading_fluency", None, q(42, "WCPM"), "observed",
  [R(8, 2, "Baseline: 42 WCPM"), R(8, 3, "The documented baseline is 42 WCPM.")], occurredOn="2024-10-18")
C("clm_goal_baseline_source", G, "baseline_source", "oral_reading_fluency", None, e("ent_academic_eval"), "observed",
  [R(8, 1, "The academic evaluation dated 2024-10-18 documents a reading fluency baseline of 42 WCPM")],
  occurredOn="2024-10-18")
C("clm_goal_target_wcpm", G, "target", "oral_reading_fluency", None, q(75, "WCPM"), "planned",
  [R(8, 1, "Maya will read at least 75 words correct per minute (WCPM)"),
   R(8, 2, "Target: 75 WCPM"),
   R(8, 3, "The annual goal targets 75 WCPM")], period=IEP_PERIOD)
C("clm_goal_accuracy", G, "accuracy_criterion", "oral_reading_accuracy", None, q(95, "%"), "planned",
  [R(8, 1, "with at least 95% accuracy"),
   R(8, 2, "Accuracy Criterion: at least 95% accuracy"),
   R(8, 3, "with at least 95% accuracy")], period=IEP_PERIOD)
C("clm_goal_mastery", G, "mastery_criterion", None, None, t("across three consecutive probes"), "planned",
  [R(8, 2, "Mastery Criterion: across three consecutive probes"),
   R(8, 1, "across three consecutive probes.")], period=IEP_PERIOD)
C("clm_goal_start", G, "start_date", None, None, d("2024-11-12"), "planned",
  [R(8, 2, "Start Date: 2024-11-12")], period=IEP_PERIOD)
C("clm_goal_target_date", G, "target_date", None, None, d("2025-11-11"), "planned",
  [R(8, 2, "Target Date: 2025-11-11"),
   R(8, 3, "by 2025-11-11.")], period=IEP_PERIOD)
C("clm_goal_measurement", G, "measurement_method", None, None,
  t("curriculum-based oral reading fluency probes"), "planned",
  [R(8, 2, "Progress will be measured using curriculum-based oral reading fluency probes.")], period=IEP_PERIOD)

# service
S = "ent_service_reading"
C("clm_service_frequency", S, "service_frequency", "specialized_reading_instruction", None, t("Weekly"), "planned",
  [R(8, 2, "Specialized reading instruction Weekly")], period=IEP_PERIOD)
C("clm_service_minutes", S, "service_minutes", "specialized_reading_instruction", None, q(150, "min/week"), "planned",
  [R(8, 2, "Weekly 150 minutes"),
   R(8, 2, "Specialized reading instruction is provided 150 minutes weekly")], period=IEP_PERIOD)
C("clm_service_location", S, "service_location", "specialized_reading_instruction", None,
  t("special education setting"), "planned",
  [R(8, 2, "150 minutes special education setting"),
   R(8, 2, "in the special education setting.")], period=IEP_PERIOD)
C("clm_service_start", S, "service_start_date", "specialized_reading_instruction", None, d("2024-11-12"), "planned",
  [R(8, 2, "special education setting 2024-11-12")], period=IEP_PERIOD)

# ---------------------------------------------------------------- missing information
GAPS.append({
    "id": "mi_parent_input_not_documented",
    "description": ("The referral says parent input will be requested and the evaluation plan lists parent "
                    "input as information to be gathered. The psychoeducational sources of information and the "
                    "eligibility evidence reviewed do not list parent input, and no supplied document records it. "
                    "A parent input form or a record of parent input in the evaluation would answer this."),
    "gapKind": "not_found_in_supplied_documents",
    "subjectEntityId": "ent_student",
    "relatedConstruct": "parent_input",
    "evidenceRefs": None,
    "proposalLineage": {"proposalItemId": "mi_parent_input_not_documented", "studyRunId": "golden-l001"},
})

# ---------------------------------------------------------------- integrity checks
ids = [c["id"] for c in CLAIMS] + [x["id"] for x in ENTITIES] + [g["id"] for g in GAPS]
assert len(ids) == len(set(ids)), "duplicate ids"
for c in CLAIMS:
    assert c["subjectEntityId"] in ENT_IDS, c["id"]
    if c["value"]["kind"] == "entity_ref":
        assert c["value"]["entityId"] in ENT_IDS, c["id"]
    assert c["evidenceRefs"], c["id"]

voice_ref = lambda owner, doc, page, quote: finalize_refs(owner, [R(doc, page, quote)])
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
        "otherPartyNoun": {"value": "the district", "from": "document",
                           "evidenceRefs": voice_ref("voice_other_party", 2, 1, "Prepared By: District")},
        "subjectName": {"value": "Maya Carter", "from": "document",
                        "evidenceRefs": voice_ref("voice_subject_name", 1, 1, "Student: Maya Carter")},
    },
    "modelMetadata": {"providerId": "golden-reference", "modelId": "claude-opus-5-5", "proposalMode": "fixture"},
    "proposedAt": "2026-10-07T00:00:00.000Z",
}
os.makedirs(OUT, exist_ok=True)
json.dump(proposal, open(os.path.join(OUT, "l001-golden.v4.json"), "w"), indent=2, ensure_ascii=False)
json.dump({"caseId": "l001", "wordLayer": "engine/intake/fixtures/l001/document-pages",
           "sourceIds": FILE_OF, "refs": EVIDENCE_INDEX},
          open(os.path.join(OUT, "l001-golden.evidence-index.json"), "w"), indent=2, ensure_ascii=False)
print(f"entities={len(ENTITIES)} claims={len(CLAIMS)} gaps={len(GAPS)} refs={len(EVIDENCE_INDEX)}")
amb = [r for r in EVIDENCE_INDEX if r["occurrencesOnPage"] > 1]
print(f"refs whose quote occurs more than once on its page: {len(amb)}")
for r in amb:
    print("  ", r["evidenceRefId"], r["page"], repr(r["quote"]), r["occurrencesOnPage"])
