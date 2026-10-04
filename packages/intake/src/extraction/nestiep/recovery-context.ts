import type { OcrEngine } from "./ocrEngine";
import type { QualityThresholds } from "./qualityGate";
import type { PageRasterizer } from "./rasterize-types";

export interface RecoveryContext {
  readonly runId: string;
  readonly stepId: string;
  readonly sourceDocumentId: string;
  readonly ocrEngine?: OcrEngine;
  readonly qualityThresholds?: QualityThresholds;
  readonly rasterizer?: PageRasterizer;
  readonly resolvePageRasterizer?: () => Promise<PageRasterizer>;
}
