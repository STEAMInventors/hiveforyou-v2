import { describe, expect, it } from "vitest";



import { CANONICAL_STUDY_PROPOSAL_SCHEMA } from "../../canonical-study/proposal";

import type { EvidenceReference as RunningEvidenceReference } from "../../canonical-study/proposal";



import { EVIDENCE_REFERENCE_V3_JSON_SCHEMA, PROPOSAL_LINEAGE_V3_JSON_SCHEMA } from "./json-schema";

import type {

  CanonicalCaseSnapshot,

  CanonicalStudyProposal,

  ClaimRole,

  ClaimValue,

  EvidenceReference,

  ValidatedClaim,

} from "./types";

import { CLAIM_ROLES, CANONICAL_STUDY_PROPOSAL_SCHEMA_V3, CASE_INTELLIGENCE_SCHEMA_V3 } from "./types";

import { validateCanonicalCaseSnapshot, validateCanonicalStudyProposal } from "./validate";



function _evidenceAssignsToRunning(ref: EvidenceReference): RunningEvidenceReference {

  return ref;

}



function _runningAssignsToV3(ref: RunningEvidenceReference): EvidenceReference {

  return ref;

}



void _evidenceAssignsToRunning;

void _runningAssignsToV3;



type LineageOnEvidence = Extract<

  keyof EvidenceReference,

  "proposalItemId" | "studyRunId" | "proposalLineage"

>;

const lineageOnEvidence: [LineageOnEvidence] extends [never] ? true : never = true;



function evidence(id: string, locator: Partial<EvidenceReference> = { page: 1 }): EvidenceReference {

  return {

    id,

    sourceDocumentId: "src-1",

    logicalDocumentId: "ld-1",

    sourceType: "document",

    ...locator,

  };

}



function claim(input: {

  id: string;

  construct: string;

  value: ClaimValue;

  role: ClaimRole;

  unit?: string;

  occurredOn?: string;

  effectivePeriod?: ValidatedClaim["effectivePeriod"];

}): ValidatedClaim {

  return {

    id: input.id,

    domainId: "domain-a",

    subjectEntityId: "entity-1",

    construct: input.construct,

    value: input.value,

    unit: input.unit,

    role: input.role,

    occurredOn: input.occurredOn,

    effectivePeriod: input.effectivePeriod,

    evidenceRefs: [evidence(`ev-${input.id}`)],

    proposalLineage: {

      proposalItemId: `proposal-${input.id}`,

      studyRunId: "run-1",

    },

  };

}



function validSnapshot(): CanonicalCaseSnapshot {

  const novelConstruct = claim({

    id: "claim-novel",

    construct: "hive_never_seen_construct_alpha",

    value: { kind: "quantity", amount: 3 },

    role: "observed",

    unit: "sessions",

  });

  const quantity = claim({

    id: "claim-quantity",

    construct: "construct_a",

    value: { kind: "quantity", amount: 12.5 },

    role: "planned",

    unit: "unit_a",

  });

  const later = claim({

    id: "claim-quantity-later",

    construct: "construct_a",

    value: { kind: "quantity", amount: 20 },

    role: "superseded",

    unit: "unit_a",

    effectivePeriod: { start: "2024-09-01", precision: "day" },

  });

  const text = claim({

    id: "claim-text",

    construct: "construct_b",

    value: { kind: "text", text: "quoted finding" },

    role: "observed",

  });

  const code = claim({

    id: "claim-code",

    construct: "construct_c",

    value: { kind: "code", code: "code_a" },

    role: "decided",

  });

  const booleanClaim = claim({

    id: "claim-boolean",

    construct: "construct_d",

    value: { kind: "boolean", value: false },

    role: "current",

  });

  const entityRef = claim({

    id: "claim-entity",

    construct: "construct_e",

    value: { kind: "entity_ref", entityId: "entity-2" },

    role: "historical",

  });

  const date = claim({

    id: "claim-date",

    construct: "construct_f",

    value: { kind: "date", value: "2024-01-15" },

    role: "observed",

    occurredOn: "2024-01-15",

  });

  const period = claim({

    id: "claim-period",

    construct: "construct_g",

    value: { kind: "period", start: "2024-01-01", end: "2024-06-01" },

    role: "required",

    effectivePeriod: { start: "2024-01-01", end: "2024-06-01", precision: "day" },

  });

  const unknown = claim({

    id: "claim-unknown",

    construct: "construct_h",

    value: { kind: "unknown" },

    role: "unknown",

  });



  return {

    schemaVersion: CASE_INTELLIGENCE_SCHEMA_V3,

    version: 1,

    caseId: "case-1",

    studyRunId: "run-1",

    createdAt: "2026-09-29T12:00:00.000Z",

    caseScope: "single_domain",

    domainId: "domain-a",

    domainPackId: "pack.study",

    domainPackVersion: "pack-2026.09",

    entities: [

      {

        id: "entity-1",

        entityType: "person",

        label: "Subject",

        evidenceRefs: [evidence("ev-entity")],

      },

    ],

    claims: [

      novelConstruct,

      quantity,

      later,

      text,

      code,

      booleanClaim,

      entityRef,

      date,

      period,

      unknown,

    ],

    events: [

      {

        id: "event-1",

        claimId: "claim-date",

        construct: "construct_f",

        subjectEntityId: "entity-1",

        occurredOn: "2024-01-15",

        evidenceRefs: [evidence("ev-event")],

        timelineOrderHint: 1,

      },

    ],

    conflicts: [

      {

        id: "conflict-1",

        claimIds: ["claim-quantity", "claim-text"],

        kind: "value_disagreement",

        subjectEntityId: "entity-1",

        construct: "construct_a",

      },

    ],

    changes: [

      {

        id: "change-1",

        subjectEntityId: "entity-1",

        construct: "construct_a",

        fromClaimId: "claim-quantity",

        toClaimId: "claim-quantity-later",

      },

    ],

    unresolved: [

      {

        id: "unresolved-document",

        kind: "missing_document",

        source: "engine1_completeness",

        relatedLogicalDocumentIds: ["ld-missing"],

      },

      {

        id: "unresolved-missing-info",

        kind: "missing_information",

        source: "model_proposal",

        description: "Evaluation date for supplemental services is not stated in the IEP.",

        subjectEntityId: "entity-1",

        relatedConstruct: "service_start_date",

        proposalLineage: {

          proposalItemId: "proposal-missing-1",

          studyRunId: "run-1",

        },

      },

      {

        id: "unresolved-missing-info-chipless",

        kind: "missing_information",

        source: "model_proposal",

        description: "No document in the case explains how eligibility was determined.",

        proposalLineage: {

          proposalItemId: "proposal-missing-2",

          studyRunId: "run-1",

        },

      },

      {

        id: "unresolved-missing-info-evidence",

        kind: "missing_information",

        source: "model_proposal",

        description: "Minutes are referenced but the weekly total is not shown.",

        evidenceRefs: [evidence("ev-gap", { page: 4, snippet: "see attached minutes" })],

        proposalLineage: {

          proposalItemId: "proposal-missing-3",

          studyRunId: "run-1",

        },

      },

      {

        id: "unresolved-conflict",

        kind: "conflict_open",

        source: "conflict",

        relatedClaimIds: ["claim-quantity", "claim-text"],

      },

    ],

    validationResult: {

      status: "SUCCEEDED",

      accepted: {

        entities: [],

        claims: [

          {

            id: "legacy-claim",

            claimType: "record_statement",

            statement: "Running validation record",

            isFactual: true,

            evidenceRefs: [

              {

                id: "ev-legacy",

                sourceDocumentId: "src-1",

                sourceType: "document",

              },

            ],

          },

        ],

        relationships: [],

        events: [],

        conflicts: [],

        missingness: [],

        derivedClaimCandidates: [],

      },

      rejected: [],

      warnings: [],

      unresolved: [],

      validationErrors: [],

      provenanceErrors: [],

      integrityErrors: [],

    },

  };

}



function validProposal(): CanonicalStudyProposal {

  return {

    schemaVersion: CANONICAL_STUDY_PROPOSAL_SCHEMA_V3,

    domainId: "domain-a",

    entities: [

      {

        id: "entity-1",

        entityType: "person",

        label: "Subject",

        evidenceRefs: [evidence("ev-entity")],

      },

    ],

    claims: [

      {

        id: "proposal-claim-1",

        subjectEntityId: "entity-1",

        construct: "construct_a",

        value: { kind: "quantity", amount: 12.5 },

        unit: "unit_a",

        role: "planned",

        evidenceRefs: [evidence("ev-proposal")],

      },

    ],

    conflicts: [],

    missingInformation: [

      {

        id: "proposal-missing-1",

        description: "Start date for related services is not documented.",

        subjectEntityId: "entity-1",

        relatedConstruct: "service_start_date",

        proposalLineage: {

          proposalItemId: "proposal-missing-1",

          studyRunId: "run-1",

        },

      },

      {

        id: "proposal-missing-2",

        description: "Eligibility basis is unclear from the uploaded set.",

        proposalLineage: {

          proposalItemId: "proposal-missing-2",

          studyRunId: "run-1",

        },

      },

    ],

    modelMetadata: {

      providerId: "fixture",

      proposalMode: "fixture",

    },

    proposedAt: "2026-09-29T12:00:00.000Z",

  };

}



function expectRejected(result: { ok: boolean; errors?: { path: string; message: string }[] }, pathPart: string): void {

  if (result.ok) {

    throw new Error(`expected rejection involving ${pathPart}`);

  }

  expect(result.errors?.some((error) => error.path.includes(pathPart))).toBe(true);

}



describe("case-intelligence/3 contracts", () => {

  it("accepts a valid /3 snapshot and round-trips JSON", () => {

    const snapshot = validSnapshot();

    const parsed = validateCanonicalCaseSnapshot(JSON.parse(JSON.stringify(snapshot)));

    if (!parsed.ok) {

      throw new Error(JSON.stringify(parsed.errors, null, 2));

    }

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {

      return;

    }

    expect(parsed.value.schemaVersion).toBe("case-intelligence/3");

    expect(parsed.value.unresolved.map((item) => item.kind).sort()).toEqual(

      ["conflict_open", "missing_document", "missing_information", "missing_information", "missing_information"].sort(),

    );

  });



  it("accepts a completely novel construct as a validated claim without unresolved fallout", () => {

    const parsed = validateCanonicalCaseSnapshot(validSnapshot());

    if (!parsed.ok) {

      throw new Error(JSON.stringify(parsed.errors, null, 2));

    }

    const novel = parsed.value.claims.find(

      (entry) => entry.construct === "hive_never_seen_construct_alpha",

    );

    expect(novel).toBeDefined();

    expect(

      parsed.value.unresolved.some(

        (item) => item.relatedConstruct === "hive_never_seen_construct_alpha",

      ),

    ).toBe(false);

  });



  it("accepts every ClaimValue variant and every ClaimRole", () => {

    const variants: ClaimValue[] = [

      { kind: "quantity", amount: 0 },

      { kind: "text", text: "a name" },

      { kind: "code", code: "code_a" },

      { kind: "boolean", value: true },

      { kind: "entity_ref", entityId: "entity-9" },

      { kind: "date", value: "2020-05-01" },

      { kind: "period", start: "2020-01-01" },

      { kind: "period", end: "2020-12-31" },

      { kind: "period", start: "2020-01-01", end: "2020-12-31" },

      { kind: "unknown" },

    ];

    for (const value of variants) {

      const snapshot = validSnapshot();

      const target = snapshot.claims[1];

      if (!target) {

        throw new Error("fixture missing claim");

      }

      target.value = value;

      const result = validateCanonicalCaseSnapshot(snapshot);

      expect(result.ok, JSON.stringify(value)).toBe(true);

    }



    for (const role of CLAIM_ROLES) {

      const snapshot = validSnapshot();

      const target = snapshot.claims[1];

      if (!target) {

        throw new Error("fixture missing claim");

      }

      target.role = role;

      expect(validateCanonicalCaseSnapshot(snapshot).ok).toBe(true);

    }

  });



  it("requires a provenance locator on evidence references for factual claims", () => {

    const base = {

      id: "ev-loc",

      sourceDocumentId: "src-1",

      sourceType: "document" as const,

    };

    for (const locator of [

      { page: 2 },

      { spanStart: 0 },

      { spanEnd: 8 },

      { snippet: "quoted finding" },

    ]) {

      const snapshot = validSnapshot();

      const target = snapshot.claims[1];

      if (!target) {

        throw new Error("fixture missing claim");

      }

      target.evidenceRefs = [{ ...base, ...locator }];

      expect(validateCanonicalCaseSnapshot(snapshot).ok, JSON.stringify(locator)).toBe(true);

    }



    const missingLocator = validSnapshot();

    const claimWithoutLocator = missingLocator.claims[1];

    if (!claimWithoutLocator) {

      throw new Error("fixture missing claim");

    }

    claimWithoutLocator.evidenceRefs = [{ ...base, extractionId: "extract-1" }];

    expectRejected(validateCanonicalCaseSnapshot(missingLocator), "evidenceRefs");

  });



  it("rejects proposal lineage fields on EvidenceReference", () => {

    expect(lineageOnEvidence).toBe(true);

    expect(Object.keys(EVIDENCE_REFERENCE_V3_JSON_SCHEMA.properties ?? {}).sort()).toEqual(

      [

        "extractionId",

        "id",

        "logicalDocumentId",

        "page",

        "pageEnd",

        "snippet",

        "sourceDocumentId",

        "sourceType",

        "spanEnd",

        "spanStart",

      ].sort(),

    );

    expect(Object.keys(PROPOSAL_LINEAGE_V3_JSON_SCHEMA.properties ?? {}).sort()).toEqual([

      "proposalItemId",

      "studyRunId",

    ]);



    const snapshot = validSnapshot();

    const target = snapshot.claims[1];

    if (!target) {

      throw new Error("fixture missing claim");

    }

    const ref = target.evidenceRefs[0];

    if (!ref) {

      throw new Error("fixture missing evidence");

    }



    for (const extra of [

      { proposalItemId: "proposal-1" },

      { studyRunId: "run-1" },

      { proposalLineage: { proposalItemId: "proposal-1", studyRunId: "run-1" } },

    ]) {

      const result = validateCanonicalCaseSnapshot({

        ...snapshot,

        claims: [{ ...target, evidenceRefs: [{ ...ref, ...extra }] }, ...snapshot.claims.slice(1)],

      });

      expectRejected(result, "evidenceRefs");

    }



    expect(validateCanonicalCaseSnapshot(snapshot).ok).toBe(true);

    expect(target.proposalLineage).toEqual({

      proposalItemId: "proposal-claim-quantity",

      studyRunId: "run-1",

    });

  });



  it("requires events to reference validated claims with time anchors", () => {

    const missingId = structuredClone(validSnapshot()) as unknown as {

      events: Array<Record<string, unknown>>;

    };

    const missingEvent = missingId.events[0];

    if (!missingEvent) {

      throw new Error("fixture missing event");

    }

    delete missingEvent.claimId;

    expectRejected(validateCanonicalCaseSnapshot(missingId), "claimId");



    const unknownId = validSnapshot();

    const event = unknownId.events[0];

    if (!event) {

      throw new Error("fixture missing event");

    }

    event.claimId = "claim-missing";

    const unknownResult = validateCanonicalCaseSnapshot(unknownId);

    expectRejected(unknownResult, "events[0].claimId");

    if (!unknownResult.ok) {

      expect(unknownResult.errors.some((error) => error.message.includes("validated claim"))).toBe(

        true,

      );

    }



    const noAnchor = validSnapshot();

    const bareEvent = noAnchor.events[0];

    if (!bareEvent) {

      throw new Error("fixture missing event");

    }

    delete bareEvent.occurredOn;

    expectRejected(validateCanonicalCaseSnapshot(noAnchor), "events[0]");



    const labeled = structuredClone(validSnapshot()) as unknown as {

      events: Array<Record<string, unknown>>;

    };

    const labeledEvent = labeled.events[0];

    if (!labeledEvent) {

      throw new Error("fixture missing event");

    }

    labeledEvent.label = "Referral received";

    expectRejected(validateCanonicalCaseSnapshot(labeled), "label");



    const orphanConflict = validSnapshot();

    const conflict = orphanConflict.conflicts[0];

    if (!conflict) {

      throw new Error("fixture missing conflict");

    }

    conflict.claimIds = ["claim-quantity", "claim-missing"];

    expectRejected(validateCanonicalCaseSnapshot(orphanConflict), "claimIds");



    const parsed = validateCanonicalCaseSnapshot(validSnapshot());

    if (!parsed.ok) {

      throw new Error(JSON.stringify(parsed.errors, null, 2));

    }

    const indexed = parsed.value.events[0];

    expect(indexed?.claimId).toBe("claim-date");

    expect(parsed.value.claims.find((entry) => entry.id === indexed?.claimId)?.occurredOn).toBe(

      "2024-01-15",

    );

  });



  it("represents model-proposed missing information with optional evidence", () => {

    const parsed = validateCanonicalCaseSnapshot(validSnapshot());

    if (!parsed.ok) {

      throw new Error(JSON.stringify(parsed.errors, null, 2));

    }

    const withSubject = parsed.value.unresolved.find((entry) => entry.id === "unresolved-missing-info");

    expect(withSubject?.description).toContain("Evaluation date");

    expect(withSubject?.proposalLineage?.proposalItemId).toBe("proposal-missing-1");



    const chipless = parsed.value.unresolved.find(

      (entry) => entry.id === "unresolved-missing-info-chipless",

    );

    expect(chipless?.evidenceRefs).toBeUndefined();



    const withEvidence = parsed.value.unresolved.find(

      (entry) => entry.id === "unresolved-missing-info-evidence",

    );

    expect(withEvidence?.evidenceRefs?.[0]).toMatchObject({ page: 4, snippet: "see attached minutes" });



    const proposal = validateCanonicalStudyProposal(validProposal());

    expect(proposal.ok).toBe(true);

    if (!proposal.ok) {

      return;

    }

    expect(proposal.value.missingInformation).toHaveLength(2);

    expect(proposal.value.missingInformation[1]?.evidenceRefs).toBeUndefined();

  });



  it("rejects malformed /3 snapshots and proposals", () => {

    const wrongVersion = validSnapshot();

    const asWrongVersion = wrongVersion as unknown as { schemaVersion: string };

    asWrongVersion.schemaVersion = "case-intelligence/2";

    expectRejected(validateCanonicalCaseSnapshot(asWrongVersion), "schemaVersion");



    const badValue = validSnapshot();

    const target = badValue.claims[1];

    if (!target) {

      throw new Error("fixture missing claim");

    }

    (target as { value: unknown }).value = { kind: "quantity", text: "not an amount" };

    expectRejected(validateCanonicalCaseSnapshot(badValue), "value");



    const badRole = validSnapshot();

    const roleTarget = badRole.claims[1];

    if (!roleTarget) {

      throw new Error("fixture missing claim");

    }

    (roleTarget as { role: string }).role = "proposed";

    expectRejected(validateCanonicalCaseSnapshot(badRole), "role");



    expect(validateCanonicalCaseSnapshot(null).ok).toBe(false);

    expect(validateCanonicalCaseSnapshot({ schemaVersion: "case-intelligence/3" }).ok).toBe(false);



    const runningProposal = {

      schemaVersion: CANONICAL_STUDY_PROPOSAL_SCHEMA,

      domainId: "domain-a",

      entities: [],

      claims: [],

      relationships: [],

      events: [],

      conflicts: [],

      missingness: [],

      derivedClaimCandidates: [],

      warnings: [],

      sourceReferences: [],

      modelMetadata: { providerId: "fixture", proposalMode: "fixture" },

      proposedAt: "2026-09-29T12:00:00.000Z",

    };

    expectRejected(validateCanonicalStudyProposal(runningProposal), "schemaVersion");



    const proposal = validProposal();

    const proposalClaim = proposal.claims[0];

    if (!proposalClaim) {

      throw new Error("fixture missing proposal claim");

    }

    proposalClaim.evidenceRefs = [

      {

        id: "ev-chipless",

        sourceDocumentId: "src-1",

        sourceType: "document",

      },

    ];

    expectRejected(validateCanonicalStudyProposal(proposal), "evidenceRefs");



    const missingInfoNoDescription = validSnapshot();

    const badMissing = missingInfoNoDescription.unresolved.find(

      (entry) => entry.id === "unresolved-missing-info",

    );

    if (!badMissing) {

      throw new Error("fixture missing unresolved row");

    }

    delete badMissing.description;

    expectRejected(validateCanonicalCaseSnapshot(missingInfoNoDescription), "description");

  });



  it("accepts a canonical-study-proposal/3 document", () => {

    const parsed = validateCanonicalStudyProposal(JSON.parse(JSON.stringify(validProposal())));

    expect(parsed.ok).toBe(true);

    if (!parsed.ok) {

      return;

    }

    expect(parsed.value.schemaVersion).toBe("canonical-study-proposal/3");

    expect(parsed.value.missingInformation[0]?.relatedConstruct).toBe("service_start_date");

  });



  it("leaves the running proposal schema on /2", () => {

    expect(CANONICAL_STUDY_PROPOSAL_SCHEMA).toBe("canonical-study-proposal/2");

    expect(CANONICAL_STUDY_PROPOSAL_SCHEMA_V3).toBe("canonical-study-proposal/3");

    expect(CASE_INTELLIGENCE_SCHEMA_V3).toBe("case-intelligence/3");

  });

});


