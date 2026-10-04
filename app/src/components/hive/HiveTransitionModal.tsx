"use client";

import { HiveBuildingModal } from "@/components/hive/HiveBuildingModal";
import type { HiveBuildingPhase } from "@/lib/hive-building-phases";

/** Full-screen hive modal for brief route transitions (hydration, redirects). */
export function HiveTransitionModal({
  phase = "discover",
  headingTestId = "hive-building-heading",
}: {
  phase?: HiveBuildingPhase;
  headingTestId?: string;
}) {
  return (
    <HiveBuildingModal
      phase={phase}
      activeStepIndex={0}
      animationKey={`transition-${phase}`}
      overlayTestId="hive-transition-modal"
      headingTestId={headingTestId}
    />
  );
}
