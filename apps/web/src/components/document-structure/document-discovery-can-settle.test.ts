import { describe, expect, it } from "vitest";

import {
  canSettleDocumentDiscovery,
  shouldShowDiscoverProcessingError,
} from "./DocumentDiscoveryExperience";
import type { HiveDiscoverResult } from "@hiveforyou/shared/discover";

function minimalResult(status: HiveDiscoverResult["run"]["status"]): HiveDiscoverResult {
  return {
    run: {
      discoverRunId: "run-1",
      caseId: "case-1",
      idempotencyKey: "key",
      providerId: "fixture",
      providerMode: "fixture",
      promptId: "p",
      promptVersion: "discover-v2",
      promptSha256: "sha",
      domainPackId: "unknown",
      domainPackVersion: "unknown",
      startedAt: new Date().toISOString(),
      status,
    },
  };
}

describe("canSettleDocumentDiscovery", () => {
  it("blocks settle while discover API is in flight", () => {
    expect(
      canSettleDocumentDiscovery({
        discoverLoading: true,
        discoverContinueInFlight: false,
        discoverResult: null,
        awaitingInput: false,
      }),
    ).toBe(false);
  });

  it("blocks settle while awaiting objective input", () => {
    expect(
      canSettleDocumentDiscovery({
        discoverLoading: false,
        discoverContinueInFlight: false,
        discoverResult: minimalResult("NEEDS_OBJECTIVE_INPUT"),
        awaitingInput: true,
      }),
    ).toBe(false);
  });

  it("allows settle after discover API failure fallback", () => {
    expect(
      canSettleDocumentDiscovery({
        discoverLoading: false,
        discoverContinueInFlight: false,
        discoverResult: null,
        awaitingInput: false,
        discoverAwaitingActivation: false,
      }),
    ).toBe(true);
  });

  it("blocks settle while discover is gated behind upload persist", () => {
    expect(
      canSettleDocumentDiscovery({
        discoverLoading: false,
        discoverContinueInFlight: false,
        discoverResult: null,
        awaitingInput: false,
        discoverAwaitingActivation: true,
      }),
    ).toBe(false);
  });

  it("allows settle when structure map document discovery is present", () => {
    expect(
      canSettleDocumentDiscovery({
        discoverLoading: false,
        discoverContinueInFlight: false,
        discoverResult: {
          ...minimalResult("NEEDS_EVIDENCE_INPUT"),
          documentDiscovery: {
            domainLabel: "Special Education (IEP)",
            domainResolutionStatus: "resolved",
            groups: [],
            documents: [],
            missingDocuments: [],
            relationships: [],
          },
        },
        awaitingInput: false,
      }),
    ).toBe(true);
  });

  it("blocks settle while continue is in flight", () => {
    expect(
      canSettleDocumentDiscovery({
        discoverLoading: false,
        discoverContinueInFlight: true,
        discoverResult: minimalResult("NEEDS_OBJECTIVE_INPUT"),
        awaitingInput: false,
      }),
    ).toBe(false);
  });

  it("does not settle on FAILED without document discovery", () => {
    expect(
      canSettleDocumentDiscovery({
        discoverLoading: false,
        discoverContinueInFlight: false,
        discoverResult: minimalResult("FAILED"),
        awaitingInput: false,
      }),
    ).toBe(false);
  });
});

describe("shouldShowDiscoverProcessingError", () => {
  it("shows error for FAILED terminal run", () => {
    expect(
      shouldShowDiscoverProcessingError({
        discoverLoading: false,
        discoverContinueInFlight: false,
        discoverResult: minimalResult("FAILED"),
        awaitingInput: false,
      }),
    ).toBe(true);
  });

  it("shows error for incomplete terminal payload", () => {
    expect(
      shouldShowDiscoverProcessingError({
        discoverLoading: false,
        discoverContinueInFlight: false,
        discoverResult: minimalResult("READY_FOR_STUDY"),
        awaitingInput: false,
      }),
    ).toBe(true);
  });
});
