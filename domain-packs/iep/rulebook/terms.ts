import type { Term } from "@hiveforyou/domain-pack-shared/rulebook/schema";

import { citesFromSections } from "./citations.ts";

/** Converted from legacy iep-rulebook.ts (sections field used only for guide mapping). */
export const IEP_TERMS: Term[] = [
  {
    id: "iep",
    abbr: "IEP",
    term: "Individualized Education Program",
    source: "regulation",
    cites: citesFromSections(["300.22", "300.320"]),
    plain:
      "The written plan for a child’s special education: where the child is now, the goals for the year, and the services and supports the school will provide.",
  },
  {
    id: "idea",
    abbr: "IDEA",
    term: "Individuals with Disabilities Education Act",
    source: "regulation",
    cites: citesFromSections(["300.1"]),
    plain:
      "The federal law that governs special education. Its rules (34 CFR Part 300) set out what an IEP includes and the rights parents have.",
  },
  {
    id: "fape",
    abbr: "FAPE",
    term: "Free Appropriate Public Education",
    source: "regulation",
    cites: citesFromSections(["300.17"]),
    plain:
      "Special education and related services provided at public expense, meeting state standards, and delivered according to the child’s IEP.",
  },
  {
    id: "iepteam",
    term: "IEP Team",
    source: "regulation",
    cites: citesFromSections(["300.321"]),
    plain:
      "The group that writes the IEP. It includes the parents, at least one regular education teacher (if the child is or may be in regular classes), at least one special education teacher or provider, a school representative, and someone who can explain evaluation results.",
  },
  {
    id: "lea",
    abbr: "LEA",
    term: "Local Educational Agency",
    source: "regulation",
    cites: citesFromSections(["300.28"]),
    plain:
      "Usually the school district. At IEP meetings, the district’s representative is someone qualified to provide or supervise special education who knows the general curriculum and the district’s available resources.",
  },
  {
    id: "sea",
    abbr: "SEA",
    term: "State Educational Agency",
    source: "regulation",
    cites: citesFromSections(["300.41"]),
    plain:
      "The state department of education. It oversees special education across the state and may add its own rules.",
  },
  {
    id: "sld",
    abbr: "SLD",
    term: "Specific Learning Disability",
    source: "common",
    cites: citesFromSections(["300.8(c)(10)"]),
    plain:
      "One of the disability categories: a difficulty in one or more of the basic processes involved in understanding or using spoken or written language, which can show up in listening, thinking, speaking, reading, writing, spelling, or math.",
  },
  {
    id: "eligibility",
    term: "Eligibility determination",
    source: "regulation",
    cites: citesFromSections(["300.306"]),
    plain:
      "The team’s decision, after an evaluation, about whether a child has a disability and needs special education.",
    aka: ["Eligibility report"],
  },
  {
    id: "reeval",
    term: "Reevaluation",
    source: "regulation",
    cites: citesFromSections(["300.303"]),
    plain:
      "A new evaluation of a child already in special education — at least once every 3 years unless the parent and school agree it isn’t needed, and not more than once a year unless they agree.",
    aka: ["Triennial", "Tri"],
  },
  {
    id: "plaafp",
    abbr: "PLAAFP",
    term: "Present Levels of Academic Achievement and Functional Performance",
    source: "common",
    cites: citesFromSections(["300.320(a)(1)"]),
    plain:
      "Where the child is right now — in school subjects and in everyday skills — and how the disability affects their progress in the general curriculum. Every goal should connect back to something here.",
    aka: ["PLOP", "PLEP", "PLP", "Present levels"],
  },
  {
    id: "gencurr",
    term: "General education curriculum",
    source: "regulation",
    cites: citesFromSections(["300.320(a)(1)(i)"]),
    plain: "The same curriculum taught to children without disabilities.",
    aka: ["General curriculum"],
  },
  {
    id: "baseline",
    term: "Baseline",
    source: "common",
    cites: [],
    plain:
      "The child’s starting point on a skill, measured before the goal begins. Progress is compared against it.",
  },
  {
    id: "mag",
    term: "Measurable annual goals",
    source: "regulation",
    cites: citesFromSections(["300.320(a)(2)"]),
    plain:
      "What the child is expected to accomplish within a year, written so progress can be measured. Goals can be academic or functional.",
    aka: ["Annual goals", "IEP goals"],
  },
  {
    id: "sto",
    abbr: "STO",
    term: "Short-term objectives or benchmarks",
    source: "common",
    cites: citesFromSections(["300.320(a)(2)(ii)"]),
    plain:
      "Smaller steps toward an annual goal. Federal rules require them only for children who take alternate assessments; some states require them for everyone.",
    aka: ["Benchmarks", "Objectives"],
  },
  {
    id: "mastery",
    term: "Mastery criteria",
    source: "common",
    cites: [],
    plain:
      "What counts as meeting the goal — for example, a score reached on three tests in a row.",
    aka: ["Criteria for mastery"],
  },
  {
    id: "progmon",
    term: "Progress monitoring",
    source: "common",
    cites: citesFromSections(["300.320(a)(3)(i)"]),
    plain: "Regular, repeated checks on a goal to see whether the child is on track.",
  },
  {
    id: "progrep",
    term: "Progress report",
    source: "regulation",
    cites: citesFromSections(["300.320(a)(3)(ii)"]),
    plain:
      "The report the school gives parents on progress toward each goal, on the schedule written in the IEP — for example, quarterly with report cards.",
  },
  {
    id: "cbm",
    abbr: "CBM",
    term: "Curriculum-Based Measurement",
    source: "common",
    cites: [],
    plain:
      "Short, timed tests given often, using material from the curriculum, to track growth on a skill.",
    aka: ["Probe"],
  },
  {
    id: "wcpm",
    abbr: "WCPM",
    term: "Words Correct Per Minute",
    source: "common",
    cites: [],
    plain: "A reading fluency score: how many words a child reads correctly in one minute.",
    aka: ["CWPM"],
  },
  {
    id: "sdi",
    abbr: "SDI",
    term: "Specially Designed Instruction",
    source: "common",
    cites: citesFromSections(["300.39(b)(3)"]),
    plain:
      "Teaching that is adapted — in content, method, or delivery — to meet the child’s needs and give access to the general curriculum. It’s what makes special education “special.”",
  },
  {
    id: "related",
    term: "Related services",
    source: "regulation",
    cites: citesFromSections(["300.34"]),
    plain:
      "Support services a child needs to benefit from special education — such as speech-language therapy, occupational therapy, counseling, or transportation.",
  },
  {
    id: "slp",
    abbr: "SLP",
    term: "Speech-Language Pathologist",
    source: "common",
    cites: citesFromSections(["300.34(c)(15)"]),
    plain: "The specialist who provides speech-language therapy.",
  },
  {
    id: "ot",
    abbr: "OT",
    term: "Occupational Therapy",
    source: "common",
    cites: citesFromSections(["300.34(c)(6)"]),
    plain:
      "A related service that builds skills for daily school tasks, such as handwriting or using tools.",
  },
  {
    id: "freq",
    term: "Frequency, location, and duration",
    source: "regulation",
    cites: citesFromSections(["300.320(a)(7)"]),
    plain:
      "How often a service happens, where, and for how long — plus the date it starts.",
    aka: ["Service minutes"],
  },
  {
    id: "saas",
    term: "Supplementary aids and services",
    source: "regulation",
    cites: citesFromSections(["300.42"]),
    plain:
      "Supports that help a child learn in regular classes and activities alongside children without disabilities.",
  },
  {
    id: "accom",
    term: "Accommodations",
    source: "regulation",
    cites: citesFromSections(["300.320(a)(6)", "300.160"]),
    plain:
      "Changes to how a child learns or is tested — like extra time or having text read aloud — that don’t change what the child is expected to learn.",
  },
  {
    id: "mods",
    term: "Program modifications",
    source: "regulation",
    cites: citesFromSections(["300.320(a)(4)"]),
    plain:
      "Changes to what a child is expected to learn or how they are graded — for example, fewer or different assignments.",
  },
  {
    id: "at",
    abbr: "AT",
    term: "Assistive Technology",
    source: "common",
    cites: citesFromSections(["300.5", "300.6"]),
    plain:
      "Devices and services that help a child do things they otherwise couldn’t, or couldn’t easily — from text-to-speech software to communication devices.",
  },
  {
    id: "altassess",
    term: "Alternate assessment",
    source: "regulation",
    cites: citesFromSections(["300.160(c)"]),
    plain:
      "A different state test for a small group of children who can’t take the regular test even with accommodations. The IEP must explain why.",
  },
  {
    id: "lre",
    abbr: "LRE",
    term: "Least Restrictive Environment",
    source: "regulation",
    cites: citesFromSections(["300.114"]),
    plain:
      "Children with disabilities are taught alongside children without disabilities as much as appropriate. Moving to a separate class or school happens only when needs can’t be met in regular classes, even with supports.",
  },
  {
    id: "continuum",
    term: "Continuum of alternative placements",
    source: "regulation",
    cites: citesFromSections(["300.115"]),
    plain:
      "The range of settings a district must have available — regular classes, special classes, special schools, home instruction, and others.",
  },
  {
    id: "special",
    term: "Special factors",
    source: "regulation",
    cites: citesFromSections(["300.324(a)(2)"]),
    plain:
      "Things the team must consider when they apply: behavior, limited English proficiency, blindness or visual impairment, communication needs, deafness or hearing loss, and assistive technology.",
  },
  {
    id: "fba",
    abbr: "FBA",
    term: "Functional Behavioral Assessment",
    source: "common",
    cites: citesFromSections(["300.530(d)", "300.530(f)"]),
    plain: "A study of why a behavior happens, used to plan support.",
  },
  {
    id: "bip",
    abbr: "BIP",
    term: "Behavioral Intervention Plan",
    source: "common",
    cites: citesFromSections(["300.530(f)"]),
    plain: "A written plan for supporting positive behavior, often based on an FBA.",
  },
  {
    id: "lep",
    abbr: "LEP",
    term: "Limited English Proficiency",
    source: "common",
    cites: citesFromSections(["300.324(a)(2)(ii)"]),
    plain:
      "When a child is still learning English. The team considers the child’s language needs as they relate to the IEP.",
    aka: ["English learner", "EL", "ELL"],
  },
  {
    id: "parentconcerns",
    term: "Parent concerns",
    source: "regulation",
    cites: citesFromSections(["300.324(a)(1)(ii)"]),
    plain:
      "The team considers the parents’ concerns for enhancing their child’s education when writing the IEP.",
    aka: ["Parent input"],
  },
  {
    id: "esy",
    abbr: "ESY",
    term: "Extended School Year services",
    source: "common",
    cites: citesFromSections(["300.106"]),
    plain:
      "Special education and related services beyond the normal school year — often in summer — when the IEP team decides they are necessary.",
  },
  {
    id: "transition",
    term: "Transition services",
    source: "regulation",
    cites: citesFromSections(["300.43", "300.320(b)"]),
    plain:
      "Activities that help a student move from school to life after school — further education, work, and independent living. Required in the IEP in effect when the student turns 16, or earlier if the team decides.",
    aka: ["Transition plan", "ITP"],
  },
  {
    id: "psgoals",
    term: "Measurable postsecondary goals",
    source: "regulation",
    cites: citesFromSections(["300.320(b)(1)"]),
    plain:
      "Goals for after high school — training, education, employment, and independent living skills where appropriate.",
  },
  {
    id: "majority",
    term: "Transfer of rights at age of majority",
    source: "regulation",
    cites: citesFromSections(["300.320(c)", "300.520"]),
    plain:
      "In many states, a parent’s educational rights move to the student at the age of majority. At least one year before, the IEP includes a statement that the student has been told which rights will transfer.",
  },
  {
    id: "pwn",
    abbr: "PWN",
    term: "Prior Written Notice",
    source: "common",
    cites: citesFromSections(["300.503"]),
    plain:
      "A written notice the school gives before it proposes or refuses to change identification, evaluation, placement, or services — saying what and why.",
  },
  {
    id: "iee",
    abbr: "IEE",
    term: "Independent Educational Evaluation",
    source: "common",
    cites: citesFromSections(["300.502"]),
    plain:
      "An evaluation by someone outside the school. If a parent disagrees with the school’s evaluation, they can request one at public expense, subject to conditions.",
  },
  {
    id: "psn",
    term: "Procedural safeguards notice",
    source: "regulation",
    cites: citesFromSections(["300.504"]),
    plain:
      "A written explanation of parents’ rights, given at least once a year and at certain other times.",
    aka: ["Parent rights", "Procedural safeguards"],
  },
  {
    id: "consent",
    term: "Consent",
    source: "regulation",
    cites: citesFromSections(["300.9", "300.300"]),
    plain:
      "A parent’s written, informed agreement. Required before an initial evaluation, first services, and reevaluation, with limited exceptions.",
  },
];

/** Legacy section ids from iep-rulebook.ts → term ids for guide assembly. */
export const IEP_TERM_SECTIONS: Record<string, string[]> = {
  basics: ["iep", "idea", "fape", "iepteam", "lea", "sea", "sld", "eligibility", "reeval"],
  present: ["plaafp", "gencurr", "baseline", "wcpm"],
  goals: ["mag", "sto", "mastery", "baseline"],
  progress: ["progmon", "progrep", "cbm", "wcpm"],
  services: ["fape", "sdi", "related", "slp", "ot", "freq"],
  supports: ["saas", "accom", "mods", "at", "altassess"],
  lre: ["lre", "continuum", "gencurr"],
  factors: ["special", "fba", "bip", "lep", "parentconcerns"],
  esy: ["esy"],
  transition: ["transition", "psgoals", "majority"],
  rights: ["pwn", "iee", "psn", "consent"],
};
