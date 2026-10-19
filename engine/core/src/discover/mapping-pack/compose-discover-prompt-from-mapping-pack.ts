import type { LoadedDiscoverPrompt } from "../../prompts/load-discover-prompt.js";
import type { DiscoverSourceDocumentInput } from "../types.js";
import type { DiscoverEnginePhase } from "../types.js";
import { composeDiscoverPromptInputs, type ComposedDiscoverPromptInputs } from "../compose-discover-prompt-inputs.js";
import type { DiscoverMappingPackContext } from "./types.js";

export type ComposedDiscoverMappingPackPromptInputs = ComposedDiscoverPromptInputs & {
  mappingPackPin: DiscoverMappingPackContext["pin"];
  mappingPackDiscoverViewSchemaVersion: string;
};

/**
 * Qualification-only: inject vocabulary from a single compiled Mapping Pack discover view.
 * Production Discover continues to use {@link composeDiscoverPromptInputs} defaults.
 */
export function composeDiscoverPromptInputsFromMappingPack(
  prompt: LoadedDiscoverPrompt,
  sourceDocuments: DiscoverSourceDocumentInput[],
  context: DiscoverMappingPackContext,
  customerObjective?: string,
  options?: {
    discoveryPhase?: DiscoverEnginePhase;
    priorCollectionProposalJson?: string;
  },
): ComposedDiscoverMappingPackPromptInputs {
  const pinBlock = JSON.stringify(
    {
      packId: context.pin.packId,
      packVersion: context.pin.packVersion,
      contentDigest: context.pin.contentDigest,
      contractVersion: context.pin.contractVersion,
      selection: context.pin.selection,
    },
    null,
    2,
  );

  const composed = composeDiscoverPromptInputs(
    prompt,
    sourceDocuments,
    [context.packSnapshot],
    customerObjective,
    options,
  );

  return {
    ...composed,
    domainPackVocabulary: `${pinBlock}\n${composed.domainPackVocabulary}`,
    mappingPackPin: context.pin,
    mappingPackDiscoverViewSchemaVersion: context.discoverView.schemaVersion,
  };
}
