import { createHash } from "node:crypto";

import { hasBundledPrompt, loadBundledPromptContent } from "./load-prompt-content";

export type LoadedDiscoverResolutionPrompt = {
  id: "discover-resolution";
  version: string;
  content: string;
  sha256: string;
};

const VERSION_FILES: Record<string, { version: string; fileName: string }> = {
  v1: { version: "v1", fileName: "discover-resolution-v1.md" },
  "discover-resolution-v1": { version: "v1", fileName: "discover-resolution-v1.md" },
};

function resolvePromptFile(fileName: string): void {
  const key = `discover/${fileName}`;
  if (!hasBundledPrompt(key)) {
    throw new Error(`Unknown discover resolution prompt file: ${fileName}`);
  }
}

export function loadDiscoverResolutionPrompt(
  version: string = "discover-resolution-v1",
): LoadedDiscoverResolutionPrompt {
  const requested = version.trim();
  const mapped = VERSION_FILES[requested] ?? VERSION_FILES["discover-resolution-v1"];
  resolvePromptFile(mapped!.fileName);
  const content = loadBundledPromptContent(`discover/${mapped!.fileName}`);
  const sha256 = createHash("sha256").update(content).digest("hex");
  return {
    id: "discover-resolution",
    version: mapped!.version,
    content,
    sha256,
  };
}
