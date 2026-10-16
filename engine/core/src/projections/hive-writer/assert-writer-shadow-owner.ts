export class WriterShadowOwnerError extends Error {
  readonly code: "WRITER_SHADOW_NOT_FOUND" | "WRITER_SHADOW_OWNER_MISMATCH";

  constructor(code: WriterShadowOwnerError["code"], message: string) {
    super(message);
    this.name = "WriterShadowOwnerError";
    this.code = code;
  }
}

/**
 * The claimed user id is compared to the persisted study and case owners.
 * Callers must use the returned user id for storage, not the event value alone.
 */
export function assertWriterShadowOwner(input: {
  claimedUserId: string;
  caseId: string;
  persistedStudy: { userId: string; caseId: string } | null;
  persistedCase: { userId: string } | null;
}): { userId: string } {
  if (!input.persistedStudy || !input.persistedCase) {
    throw new WriterShadowOwnerError(
      "WRITER_SHADOW_NOT_FOUND",
      "Study or case was not found.",
    );
  }
  const ownerId = input.persistedStudy.userId.trim();
  if (
    ownerId.length === 0 ||
    input.persistedStudy.caseId !== input.caseId ||
    input.persistedCase.userId.trim() !== ownerId ||
    input.claimedUserId.trim() !== ownerId
  ) {
    throw new WriterShadowOwnerError(
      "WRITER_SHADOW_OWNER_MISMATCH",
      "Writer shadow request does not match the persisted case owner.",
    );
  }
  return { userId: ownerId };
}
