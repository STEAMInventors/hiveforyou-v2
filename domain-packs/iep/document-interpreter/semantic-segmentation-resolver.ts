import type { PacketSegmentationResolver } from "@hiveforyou/domain-pack";

/**
 * Pack-level contract for proposing logical document boundaries inside one upload.
 *
 * NestIEP (`lib/scan/semantic-adapters.ts`) exposes `segmentPacket?: LogicalSegmentationResolver`
 * but has no in-repo production implementation at commit 89b20b3 — only tests inject proposals.
 *
 * **Jev is not suitable** for this task today: Jev `POST /api/v1/decide` classifies a single
 * document identity from a short text sample. It does not accept ordered multi-page packet text
 * or return validated page-range boundaries. Do not route segmentation through Jev without a
 * new, explicitly documented contract and the same deterministic validation gate below.
 *
 * Any adapter implementing `PacketSegmentationResolver` produces proposals only. The IEP pack
 * runs `validateLogicalBoundaries` and fails closed to an unsplit packet + NEEDS_REVIEW when
 * validation fails.
 */
export type IepPacketSegmentationResolver = PacketSegmentationResolver;
