import {
  OTHER_AUDIENCE_ROLE_ID,
  findSharingAudienceRole,
  listSharingAudienceRoles,
  type AudienceRoleResolutionInput,
} from "@hiveforyou/domain-packs";
import type { DomainCustomerContextIntake } from "@hiveforyou/shared/case-customer-context";
import type { ProposedSuggestedAudience } from "@hiveforyou/shared/discover";

/** UI-only audience choices — not persisted as role ids. */
export const UI_AUDIENCE_JUST_FOR_ME_ID = "audience.just_for_me";
export const UI_AUDIENCE_SOMEONE_ELSE_ID = "audience.someone_else";

const MODEL_SELF_AUDIENCE_ID = "aud-self";

function isJustForMeAudience(roleId: string, label?: string): boolean {
  if (roleId === UI_AUDIENCE_JUST_FOR_ME_ID || roleId === MODEL_SELF_AUDIENCE_ID) {
    return true;
  }
  return typeof label === "string" && /just for me/i.test(label.trim());
}

function roleHintCandidates(roleHint: string): string[] {
  const hint = roleHint.trim();
  if (!hint) {
    return [];
  }
  const candidates = [hint];
  if (!hint.includes(".")) {
    candidates.push(`generic.${hint}`);
  }
  return candidates;
}

/**
 * Maps objective-modal intake (including model-suggested audience ids) to pack/generic role ids.
 */
export function normalizeIntendedAudienceForPersistence(
  intake: DomainCustomerContextIntake,
  resolution: AudienceRoleResolutionInput,
  suggestedAudiences?: ProposedSuggestedAudience[],
): Pick<DomainCustomerContextIntake, "intendedAudienceRoleId" | "intendedAudienceOtherRole"> {
  if (intake.shareIntent !== "yes") {
    throw new Error("INTENDED_AUDIENCE_NOT_APPLICABLE");
  }

  let roleId = intake.intendedAudienceRoleId?.trim();
  let otherRoleText = intake.intendedAudienceOtherRole?.trim();

  if (
    roleId === UI_AUDIENCE_SOMEONE_ELSE_ID ||
    roleId === "aud-other" ||
    (!roleId && otherRoleText)
  ) {
    roleId = OTHER_AUDIENCE_ROLE_ID;
    otherRoleText = otherRoleText || "Someone else";
  }

  if (!roleId) {
    throw new Error("INTENDED_AUDIENCE_REQUIRED");
  }

  if (isJustForMeAudience(roleId)) {
    throw new Error("INTENDED_AUDIENCE_REQUIRED");
  }

  const direct = findSharingAudienceRole(resolution, roleId);
  if (direct) {
    return buildNormalizedAudience(direct.roleId, direct.allowsFreeText, otherRoleText);
  }

  const suggested = suggestedAudiences?.find((item) => item.id === roleId);
  if (suggested) {
    if (isJustForMeAudience(suggested.id, suggested.label)) {
      throw new Error("INTENDED_AUDIENCE_REQUIRED");
    }
    if (suggested.roleHint.trim() === "personal_review" || isJustForMeAudience("", suggested.label)) {
      throw new Error("INTENDED_AUDIENCE_REQUIRED");
    }

    for (const candidate of roleHintCandidates(suggested.roleHint)) {
      const option = findSharingAudienceRole(resolution, candidate);
      if (option) {
        return buildNormalizedAudience(option.roleId, option.allowsFreeText, otherRoleText);
      }
    }

    const byLabel = listSharingAudienceRoles(resolution).find(
      (role) => role.label.toLowerCase() === suggested.label.trim().toLowerCase(),
    );
    if (byLabel) {
      return buildNormalizedAudience(byLabel.roleId, byLabel.allowsFreeText, otherRoleText);
    }

    if (
      suggested.roleHint.trim() === OTHER_AUDIENCE_ROLE_ID ||
      suggested.roleHint.trim() === "other"
    ) {
      return {
        intendedAudienceRoleId: OTHER_AUDIENCE_ROLE_ID,
        intendedAudienceOtherRole: otherRoleText || suggested.label.trim(),
      };
    }

    return {
      intendedAudienceRoleId: OTHER_AUDIENCE_ROLE_ID,
      intendedAudienceOtherRole: otherRoleText || suggested.label.trim(),
    };
  }

  throw new Error("INTENDED_AUDIENCE_UNKNOWN_ROLE");
}

function buildNormalizedAudience(
  roleId: string,
  allowsFreeText: boolean,
  otherRoleText?: string,
): Pick<DomainCustomerContextIntake, "intendedAudienceRoleId" | "intendedAudienceOtherRole"> {
  if (allowsFreeText) {
    const text = otherRoleText?.trim();
    if (!text) {
      throw new Error("INTENDED_AUDIENCE_OTHER_TEXT_REQUIRED");
    }
    return { intendedAudienceRoleId: roleId, intendedAudienceOtherRole: text };
  }
  if (otherRoleText) {
    return { intendedAudienceRoleId: roleId, intendedAudienceOtherRole: otherRoleText };
  }
  return { intendedAudienceRoleId: roleId };
}
