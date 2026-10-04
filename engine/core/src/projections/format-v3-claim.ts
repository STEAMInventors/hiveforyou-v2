import type { ClaimValue, ProposedEntity, ValidatedClaim } from "@hiveforyou/shared/case-intelligence/3";

export function humanizeConstruct(construct: string): string {
  return construct.replace(/_/g, " ").trim();
}

export function formatClaimValue(value: ClaimValue, unit?: string): string {
  switch (value.kind) {
    case "quantity":
      return unit ? `${value.amount} ${unit}` : String(value.amount);
    case "text":
      return value.text;
    case "code":
      return value.code;
    case "boolean":
      return value.value ? "yes" : "no";
    case "date":
      return value.value;
    case "period": {
      const start = value.start ?? "…";
      const end = value.end ?? "…";
      return `${start} – ${end}`;
    }
    case "entity_ref":
      return value.entityId;
    case "unknown":
    default:
      return "unknown value";
  }
}

export function formatValidatedClaimSentence(
  claim: ValidatedClaim,
  entitiesById: Map<string, ProposedEntity>,
): string {
  const subject = entitiesById.get(claim.subjectEntityId)?.label ?? claim.subjectEntityId;
  const construct = humanizeConstruct(claim.construct);
  const value = formatClaimValue(claim.value, claim.unit);
  const time =
    claim.occurredOn?.trim() ||
    claim.effectivePeriod?.start?.trim() ||
    claim.effectivePeriod?.end?.trim();
  if (time) {
    return `${subject}: ${construct} — ${value} (${time})`;
  }
  return `${subject}: ${construct} — ${value}`;
}
