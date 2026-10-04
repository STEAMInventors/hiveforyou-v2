import type { Term } from "@hiveforyou/domain-pack-shared/rulebook/schema";

export const MEDICAID_TERMS: Term[] = [
  {
    id: "noa",
    abbr: "NOA",
    term: "Notice of Action",
    source: "common",
    cites: [{ code: "42 CFR §431.210", ref: "mcd:431.210" }],
    plain:
      "The letter that tells you the agency is denying, reducing, or ending a benefit.",
    aka: ["Notice of adverse action", "Denial letter"],
  },
  {
    id: "fairhearing",
    term: "Fair hearing",
    source: "regulation",
    cites: [{ code: "42 CFR §431.221", ref: "mcd:431.221" }],
    plain:
      "A review by an impartial hearing officer when you disagree with the agency’s decision.",
    aka: ["State fair hearing", "Appeal"],
  },
  {
    id: "aidpending",
    term: "Continued benefits",
    source: "common",
    cites: [{ code: "42 CFR §431.230", ref: "mcd:431.230" }],
    plain: "Keeping your current benefits while your hearing is pending.",
    aka: ["Aid paid pending", "Continuation of benefits"],
  },
  {
    id: "effdate",
    term: "Effective date",
    source: "common",
    cites: [],
    plain: "The date the change in your benefits takes effect.",
  },
];
