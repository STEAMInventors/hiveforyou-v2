import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { OwnedHiveSummary } from "@hiveforyou/shared/cases";

import { CaseHiveList } from "./CaseHiveList";

const emptyWorkspace = {
  intakeRunId: null,
  studyRunId: null,
  studyRunStatus: null,
} as const;

function hive(partial: Partial<OwnedHiveSummary> & Pick<OwnedHiveSummary, "caseId">): OwnedHiveSummary {
  return {
    domainId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    workspace: emptyWorkspace,
    ...partial,
  };
}

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("CaseHiveList", () => {
  it("links each hive card to the documents workspace with resolved run ids", () => {
    render(
      <CaseHiveList
        hives={[
          hive({
            caseId: "11111111-1111-4111-8111-111111111111",
            workspace: {
              intakeRunId: "22222222-2222-4222-8222-222222222222",
              studyRunId: "33333333-3333-4333-8333-333333333333",
              studyRunStatus: "SUCCEEDED",
            },
          }),
          hive({
            caseId: "44444444-4444-4444-8444-444444444444",
            workspace: emptyWorkspace,
          }),
        ]}
      />,
    );

    const first = screen.getByTestId("case-hive-list-item-11111111-1111-4111-8111-111111111111");
    expect(first.getAttribute("href")).toContain("/hives/11111111-1111-4111-8111-111111111111/ready");
    expect(first.getAttribute("href")).toContain("studyRunId=33333333-3333-4333-8333-333333333333");
    expect(first.getAttribute("href")).toContain("intakeRunId=22222222-2222-4222-8222-222222222222");
    expect(first.getAttribute("href")).not.toContain("documentsView=raw-extractions");

    const second = screen.getByTestId("case-hive-list-item-44444444-4444-4444-8444-444444444444");
    expect(second.getAttribute("href")).toBe("/hives/44444444-4444-4444-8444-444444444444/ready");
  });
});
