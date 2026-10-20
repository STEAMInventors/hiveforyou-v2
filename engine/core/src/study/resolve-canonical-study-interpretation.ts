import { readFileSync } from "node:fs";

import type { ProposalDomainPack } from "@hiveforyou/domain-pack";
import {
  assertReaderPackCompatibleWithOverlay,
  hashInterpretationOverlay,
  mergeInterpretationOntoReaderPack,
  parseInterpretationOverlay,
  type InterpretationOverlay,
} from "@hiveforyou/domain-pack/interpretation-ruleset";

import { resolveInterpretationOverlayPath } from "./interpretation-overlay-catalog.js";

/** Historical L001 baseline Reader proposal pack digest (pinned studies). */
export const L001_READER_PACK_CONTENT_SHA256 =
  "c2baa0439d32496a3110f5388f6048395a9f4c8fdce79b3d0cec36ae6b9a7775" as const;

/** DP-03B candidate Reader proposal pack digest (`iep@0.3.0-proposed`). */
export const IEP_CANDIDATE_READER_PACK_CONTENT_SHA256 =
  "b1bafe209b771a10b55cebd3bf745e476e77e1bcaf3c3cf051aa022ef719f757" as const;

export type ResolvedCanonicalStudyInterpretation = {
  overlay: InterpretationOverlay;
  overlayPath: string;
  overlayContentSha256: string;
  mergedPack: ProposalDomainPack;
};

export function loadCanonicalStudyInterpretationOverlay(input: {
  readerPackContentSha256: string;
  domainId?: string | null;
  env?: Record<string, string | undefined>;
}): { overlay: InterpretationOverlay; path: string } {
  const env = input.env ?? process.env;
  const override = env.HIVE_CANONICAL_STUDY_INTERPRETATION_OVERLAY_JSON?.trim();
  let path: string;
  if (override) {
    path = override;
  } else {
    const resolved = resolveInterpretationOverlayPath({
      readerPackContentSha256: input.readerPackContentSha256,
      domainId: input.domainId,
      env,
    });
    if (!resolved) {
      throw new Error("INTERPRETATION_OVERLAY_NOT_FOUND");
    }
    path = resolved.overlayPath;
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return { overlay: parseInterpretationOverlay(raw), path };
}

export function resolveCanonicalStudyInterpretation(input: {
  readerPack: ProposalDomainPack;
  readerPackContentSha256: string;
  domainId?: string | null;
  env?: Record<string, string | undefined>;
}): ResolvedCanonicalStudyInterpretation {
  const env = input.env ?? process.env;
  const { overlay, path } = loadCanonicalStudyInterpretationOverlay({
    readerPackContentSha256: input.readerPackContentSha256,
    domainId: input.domainId,
    env,
  });
  assertReaderPackCompatibleWithOverlay(input.readerPackContentSha256, overlay);
  const overlayContentSha256 = hashInterpretationOverlay(overlay);
  const mergedPack = mergeInterpretationOntoReaderPack(input.readerPack, overlay);
  return {
    overlay,
    overlayPath: path,
    overlayContentSha256,
    mergedPack,
  };
}

export type CanonicalStudyInterpretationApplication = {
  studyPack: ProposalDomainPack;
  interpretationRulesetId: string | null;
  interpretationRulesetContentSha256: string | null;
};

/** Applies an overlay when env override or domain compatibility catalog matches the reader snapshot. */
export function applyCanonicalStudyInterpretationIfCompatible(input: {
  readerPack: ProposalDomainPack;
  readerPackContentSha256: string;
  domainId?: string | null;
  env?: Record<string, string | undefined>;
}): CanonicalStudyInterpretationApplication {
  try {
    const resolved = resolveCanonicalStudyInterpretation(input);
    return {
      studyPack: resolved.mergedPack,
      interpretationRulesetId: resolved.overlay.manifest.id,
      interpretationRulesetContentSha256: resolved.overlayContentSha256,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INTERPRETATION_READER_PACK_INCOMPATIBLE") {
        return {
          studyPack: input.readerPack,
          interpretationRulesetId: null,
          interpretationRulesetContentSha256: null,
        };
      }
      if (error.message === "INTERPRETATION_OVERLAY_NOT_FOUND") {
        return {
          studyPack: input.readerPack,
          interpretationRulesetId: null,
          interpretationRulesetContentSha256: null,
        };
      }
    }
    throw error;
  }
}
