import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { listSharingAudienceRoles } from "@hiveforyou/domain-packs";
import type { DiscoverCollectionUnderstanding, DiscoverQuestion } from "@hiveforyou/shared/discover";

import { DiscoveryObjectiveIntakeContent } from "./DiscoveryObjectiveIntakeContent";

const objectiveQuestion: DiscoverQuestion = {
  id: "q-objective",
  questionKey: "discovery.objective.iep",
  prompt: "What should Hive focus on?",
  humanReason: "This guides emphasis only.",
  answerKind: "single_choice",
  options: [
    { id: "obj-1", label: "Understand the records" },
    { id: "objective.something_else", label: "Something else" },
  ],
  ambiguityKey: "discovery.objective",
  relatedLogicalDocumentIds: [],
  required: true,
};

const suggestions = {
  suggestedObjectives: [
    { id: "obj-1", label: "Understand the records", summary: "Read them" },
    { id: "obj-2", label: "Prepare", summary: "Get ready" },
    { id: "obj-3", label: "Compare", summary: "Line them up" },
  ],
  suggestedAudiences: [{ id: "aud-self", label: "Just for me", roleHint: "self" }],
};

function renderIntake(domainResolved: boolean) {
  const onSubmit = vi.fn();
  render(
    <DiscoveryObjectiveIntakeContent
      objectiveQuestions={[objectiveQuestion]}
      audienceRoles={listSharingAudienceRoles(
        domainResolved
          ? { domainResolved: true, domainId: "iep", domainLabel: "Special education records" }
          : { domainResolved: false },
      )}
      submitting={false}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

function reachAudienceStep() {
  fireEvent.click(screen.getByRole("radio", { name: "Understand the records" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

const CONFIRMATION_HEADING = "I found a few different areas in your documents";

function renderWithGroups(
  domainGroups: DiscoverCollectionUnderstanding["domainGroups"],
) {
  render(
    <DiscoveryObjectiveIntakeContent
      objectiveQuestions={[objectiveQuestion]}
      collectionUnderstanding={{
        domainResolutionStatus: uniqueStatus(domainGroups),
        domainGroups,
        unresolvedAmbiguitySummary: null,
      }}
      audienceRoles={listSharingAudienceRoles({ domainResolved: false })}
      submitting={false}
      onSubmit={vi.fn()}
    />,
  );
}

function uniqueStatus(
  groups: DiscoverCollectionUnderstanding["domainGroups"],
): DiscoverCollectionUnderstanding["domainResolutionStatus"] {
  return new Set(groups.map((group) => group.domainId)).size > 1 ? "MULTI_DOMAIN" : "SINGLE_DOMAIN";
}

describe("DiscoveryObjectiveIntakeContent domain confirmation", () => {
  it("does not ask the customer to choose between same-domain subgroups", () => {
    renderWithGroups([
      {
        id: "evaluations",
        domainId: "iep",
        domainLabel: "Special education records",
        logicalDocumentIds: ["e1", "e2", "e3", "e4", "e5", "e6", "e7"],
        description: "Evaluation records",
        ...suggestions,
      },
      {
        id: "planning",
        domainId: "iep",
        domainLabel: "Special education records",
        logicalDocumentIds: ["p1"],
        description: "Planning records",
        ...suggestions,
      },
    ]);
    expect(screen.queryByText(CONFIRMATION_HEADING)).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByRole("radio", { name: "Understand the records" })).toBeTruthy();
  });

  it("shows one card per domain when unique domain ids differ", () => {
    renderWithGroups([
      {
        id: "iep",
        domainId: "iep",
        domainLabel: "Special education records",
        logicalDocumentIds: ["e1", "p1"],
        description: "Special education records",
        ...suggestions,
      },
      {
        id: "bankruptcy",
        domainId: "bankruptcy",
        domainLabel: "Bankruptcy",
        logicalDocumentIds: ["b1"],
        description: "Bankruptcy filings",
        ...suggestions,
      },
    ]);
    expect(screen.getByText(CONFIRMATION_HEADING)).toBeTruthy();
    expect(screen.getByText("Bankruptcy")).toBeTruthy();
    expect(screen.getByText(/· 2 documents/)).toBeTruthy();
    expect(screen.getByText(/· 1 document$/)).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("DiscoveryObjectiveIntakeContent audience roles", () => {
  it("shows model-suggested objectives and audience choices", () => {
    renderIntake(false);
    expect(screen.getByRole("radio", { name: "Understand the records" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Something else" })).toBeTruthy();
    reachAudienceStep();
    expect(screen.getByRole("radio", { name: "Just for me" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Someone else" })).toBeTruthy();
  });

  it("shows domain pack roles once the domain is resolved and keeps other free text", () => {
    const onSubmit = renderIntake(true);
    reachAudienceStep();
    expect(screen.getByRole("radio", { name: "School/team" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Advocate" })).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Role or relationship" }), {
      target: { value: "Coach" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        intake: expect.objectContaining({
          domains: [
            expect.objectContaining({
              shareIntent: "yes",
              intendedAudienceRoleId: "other",
              intendedAudienceOtherRole: "Coach",
            }),
          ],
        }),
      }),
    );
  });
});
