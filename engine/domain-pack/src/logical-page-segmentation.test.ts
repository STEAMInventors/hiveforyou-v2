import { describe, expect, it } from "vitest";

import { validateLogicalPageBoundaries } from "./logical-page-segmentation";

describe("validateLogicalPageBoundaries", () => {
  it("accepts contiguous ordered ranges", () => {
    const result = validateLogicalPageBoundaries(
      [
        {
          logicalDocumentId: "a",
          sourceUploadId: "u",
          startPage: 1,
          endPage: 2,
          confidence: 1,
        },
        {
          logicalDocumentId: "b",
          sourceUploadId: "u",
          startPage: 3,
          endPage: 6,
          confidence: 1,
        },
      ],
      6,
    );
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects overlap", () => {
    const result = validateLogicalPageBoundaries(
      [
        {
          logicalDocumentId: "a",
          sourceUploadId: "u",
          startPage: 1,
          endPage: 4,
          confidence: 1,
        },
        {
          logicalDocumentId: "b",
          sourceUploadId: "u",
          startPage: 3,
          endPage: 6,
          confidence: 1,
        },
      ],
      6,
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("overlapping_ranges");
  });

  it("rejects unexplained gaps", () => {
    const result = validateLogicalPageBoundaries(
      [
        {
          logicalDocumentId: "a",
          sourceUploadId: "u",
          startPage: 1,
          endPage: 2,
          confidence: 1,
        },
        {
          logicalDocumentId: "b",
          sourceUploadId: "u",
          startPage: 5,
          endPage: 6,
          confidence: 1,
        },
      ],
      6,
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("unexplained_gap");
  });

  it("rejects out-of-range and reversed ranges", () => {
    const high = validateLogicalPageBoundaries(
      [
        {
          logicalDocumentId: "a",
          sourceUploadId: "u",
          startPage: 1,
          endPage: 10,
          confidence: 1,
        },
      ],
      6,
    );
    expect(high.ok).toBe(false);
    expect(high.errors).toContain("range_out_of_bounds");

    const reversed = validateLogicalPageBoundaries(
      [
        {
          logicalDocumentId: "a",
          sourceUploadId: "u",
          startPage: 4,
          endPage: 2,
          confidence: 1,
        },
      ],
      6,
    );
    expect(reversed.ok).toBe(false);
    expect(reversed.errors).toContain("range_out_of_bounds");
  });

  it("rejects trailing uncovered pages", () => {
    const result = validateLogicalPageBoundaries(
      [
        {
          logicalDocumentId: "a",
          sourceUploadId: "u",
          startPage: 1,
          endPage: 4,
          confidence: 1,
        },
      ],
      6,
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("trailing_gap");
  });

  it("rejects empty proposals", () => {
    const result = validateLogicalPageBoundaries([], 3);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("empty_boundaries");
  });
});
