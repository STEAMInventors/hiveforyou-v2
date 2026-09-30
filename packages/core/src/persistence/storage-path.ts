const UNSAFE_SEGMENT = /[\\/]|^\.\.?$/;

export function sanitizeOriginalFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "document";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  if (!cleaned || cleaned === "." || cleaned === "..") {
    return "document";
  }
  return cleaned.slice(0, 180);
}

function assertPathSegment(value: string, label: string): void {
  if (!value || UNSAFE_SEGMENT.test(value) || value.includes("..")) {
    throw new Error(`Invalid storage ${label}`);
  }
}

export function buildSourceDocumentStoragePath(input: {
  userId: string;
  caseId: string;
  sourceDocumentId: string;
  originalFilename: string;
}): string {
  assertPathSegment(input.userId, "userId");
  assertPathSegment(input.caseId, "caseId");
  assertPathSegment(input.sourceDocumentId, "sourceDocumentId");
  const filename = sanitizeOriginalFilename(input.originalFilename);
  return `${input.userId}/${input.caseId}/${input.sourceDocumentId}/${filename}`;
}

export function canAccessStorageObject(actorUserId: string, storagePath: string): boolean {
  if (!actorUserId || storagePath.includes("..") || storagePath.includes("\\")) {
    return false;
  }
  const [owner] = storagePath.split("/");
  return owner === actorUserId;
}
