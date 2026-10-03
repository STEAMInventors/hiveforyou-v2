import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CaseMapStudyingState } from "./CaseMapStudyingState";

describe("CaseMapStudyingState", () => {
  it("respects prefers-reduced-motion by not requiring animation classes", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
    render(<CaseMapStudyingState rootLabel="Case" />);
    expect(screen.getByTestId("case-map-studying")).toBeInTheDocument();
    expect(screen.getByTestId("case-map-studying-message")).toHaveTextContent(
      "Understanding the case",
    );
  });
});
