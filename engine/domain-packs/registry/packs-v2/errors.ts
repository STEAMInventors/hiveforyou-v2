export type PackValidationError = {
  file: string;
  path: string;
  message: string;
};

export type PackValidationWarning = {
  file: string;
  path: string;
  message: string;
};

export class PackValidationFailedError extends Error {
  readonly errors: PackValidationError[];

  constructor(errors: PackValidationError[]) {
    super(`Pack validation failed with ${errors.length} error(s)`);
    this.name = "PackValidationFailedError";
    this.errors = errors;
  }
}

export function pushError(
  errors: PackValidationError[],
  file: string,
  path: string,
  message: string,
): void {
  errors.push({ file, path, message });
}

export function pushWarning(
  warnings: PackValidationWarning[],
  file: string,
  path: string,
  message: string,
): void {
  warnings.push({ file, path, message });
}
