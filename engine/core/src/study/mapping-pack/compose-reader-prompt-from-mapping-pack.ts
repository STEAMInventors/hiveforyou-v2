import {
  compilePackDrivenReaderPrompt,
  type CompilePackDrivenReaderPromptInput,
  type CompilePackDrivenReaderPromptResult,
} from "@hiveforyou/domain-pack/pack-driven-reader";

import type { ReaderMappingPackContext } from "./types.js";

export type ComposedReaderMappingPackPrompt = CompilePackDrivenReaderPromptResult & {
  mappingPackPin: ReaderMappingPackContext["pin"];
  mappingPackReaderViewSchemaVersion: string;
};

/**
 * Qualification-only: compile pack-driven Reader prompts from the Mapping Pack reader stage view.
 * Production pack_driven Reader continues to resolve proposal packs via study context pins.
 */
export function composeReaderPromptFromMappingPack(
  context: ReaderMappingPackContext,
  input: Omit<CompilePackDrivenReaderPromptInput, "pack">,
): ComposedReaderMappingPackPrompt {
  const compiled = compilePackDrivenReaderPrompt({
    ...input,
    pack: context.proposalPack,
  });

  if (compiled.packId !== context.pin.packId) {
    throw new Error("Compiled reader prompt packId mismatch vs mapping pack pin");
  }
  if (compiled.packVersion !== context.pin.packVersion) {
    throw new Error("Compiled reader prompt packVersion mismatch vs mapping pack pin");
  }

  return {
    ...compiled,
    mappingPackPin: context.pin,
    mappingPackReaderViewSchemaVersion: context.readerView.schemaVersion,
  };
}
