export const HIVE_NAME_MAX_LENGTH = 100;
export const HIVE_DESCRIPTION_MAX_LENGTH = 500;

export type CreateHiveValidationResult =
  | { ok: true; hiveName: string; hiveDescription: string | null }
  | { ok: false; hiveNameError?: string; hiveDescriptionError?: string };

export function validateCreateHiveInput(input: {
  hiveName: string;
  hiveDescription: string;
}): CreateHiveValidationResult {
  const trimmedName = input.hiveName.trim();
  const trimmedDescription = input.hiveDescription.trim();

  let hiveNameError: string | undefined;
  let hiveDescriptionError: string | undefined;

  if (!trimmedName) {
    hiveNameError = "Give your Hive a name so you can find it later.";
  } else if (trimmedName.length > HIVE_NAME_MAX_LENGTH) {
    hiveNameError = `Hive name must be ${HIVE_NAME_MAX_LENGTH} characters or fewer.`;
  }

  if (trimmedDescription.length > HIVE_DESCRIPTION_MAX_LENGTH) {
    hiveDescriptionError = `Description must be ${HIVE_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }

  if (hiveNameError || hiveDescriptionError) {
    return { ok: false, hiveNameError, hiveDescriptionError };
  }

  return {
    ok: true,
    hiveName: trimmedName,
    hiveDescription: trimmedDescription.length > 0 ? trimmedDescription : null,
  };
}
