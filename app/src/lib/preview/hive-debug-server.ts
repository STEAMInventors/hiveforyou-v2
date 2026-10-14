import "server-only";

import { NextResponse } from "next/server";

export {
  isHiveDebugApiPath,
  isHiveDebugPagePath,
  isHiveDebugRoutesEnabled,
} from "./preview-gate";

import { isHiveDebugRoutesEnabled } from "./preview-gate";

export function debugRoutesDisabledResponse(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

export function denyUnlessHiveDebugRoutesEnabled(): NextResponse | null {
  if (!isHiveDebugRoutesEnabled()) {
    return debugRoutesDisabledResponse();
  }
  return null;
}

export function assertHiveDebugRoutesEnabled(): void {
  if (!isHiveDebugRoutesEnabled()) {
    throw new DebugRoutesDisabledError();
  }
}

export class DebugRoutesDisabledError extends Error {
  readonly code = "DEBUG_ROUTES_DISABLED";

  constructor() {
    super("Debug routes are not enabled.");
    this.name = "DebugRoutesDisabledError";
  }
}
