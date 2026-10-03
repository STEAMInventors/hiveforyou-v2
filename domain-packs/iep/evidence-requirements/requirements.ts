import type { DiscoverMissingExpectation } from "@hiveforyou/domain-pack";

/**
 * Intake / Discover missing-document expectations for IEP.
 *
 * Provenance audit (NestIEP @ 89b20b3): `lib/scan` has document classification and
 * §300.320 structural completeness inside an IEP document — not pack-level “expected
 * upload these document types for every intake.” `process-lifecycle.ts` defines federal
 * process stages for sequencing maps only. No NestIEP rule source defines PWN or prior-year
 * progress report as universal EXPECTED uploads for L001.
 *
 * Do not invent requirements here. When an authoritative pack requirement source exists,
 * add rows with traceable rule references.
 */
export const IEP_EVIDENCE_REQUIREMENTS: DiscoverMissingExpectation[] = [];
