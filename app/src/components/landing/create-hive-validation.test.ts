import { describe, expect, it } from "vitest";

import {
  HIVE_DESCRIPTION_MAX_LENGTH,
  HIVE_NAME_MAX_LENGTH,
  validateCreateHiveInput,
} from "./create-hive-validation";

describe("validateCreateHiveInput", () => {
  it("requires a non-blank hive name", () => {
    expect(validateCreateHiveInput({ hiveName: "   ", hiveDescription: "" })).toEqual({
      ok: false,
      hiveNameError: "Give your Hive a name so you can find it later.",
    });
  });

  it("accepts trimmed name and optional description", () => {
    expect(
      validateCreateHiveInput({
        hiveName: "  Maya's IEP  ",
        hiveDescription: "  Annual review prep  ",
      }),
    ).toEqual({
      ok: true,
      hiveName: "Maya's IEP",
      hiveDescription: "Annual review prep",
    });
  });

  it("enforces max lengths", () => {
    const longName = "a".repeat(HIVE_NAME_MAX_LENGTH + 1);
    const longDescription = "b".repeat(HIVE_DESCRIPTION_MAX_LENGTH + 1);
    expect(validateCreateHiveInput({ hiveName: longName, hiveDescription: longDescription })).toEqual({
      ok: false,
      hiveNameError: `Hive name must be ${HIVE_NAME_MAX_LENGTH} characters or fewer.`,
      hiveDescriptionError: `Description must be ${HIVE_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
    });
  });
});
