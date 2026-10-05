import type { NarrativeCondition } from "@hiveforyou/domain-pack";
import type { Study } from "@hiveforyou/shared/pack-study";

export function evaluateNarrativeCondition(study: Study, when: NarrativeCondition): boolean {
  switch (when.kind) {
    case "anchorExists":
      return when.role === "prior" ? study.anchors.prior != null : study.anchors.current != null;
    case "factExists":
      return Boolean(study.facts[when.slot]);
    case "seriesPointAfter":
      return (
        when.anchor === "prior" &&
        study.anchors.prior != null &&
        study.seriesAfterPrior != null &&
        study.facts[when.measure] != null
      );
    case "recordGapMonths":
      return study.recordGap != null && study.recordGap.months >= when.gte;
    case "anchorsDiffer": {
      const prior = study.facts[`prior.${when.slot}`]?.raw;
      const current = study.facts[`current.${when.slot}`]?.raw;
      return prior != null && current != null && prior !== current;
    }
    case "topSignal":
      return study.topSignal != null;
    default:
      return false;
  }
}
