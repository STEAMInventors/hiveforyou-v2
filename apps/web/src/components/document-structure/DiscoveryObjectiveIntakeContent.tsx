"use client";

import { useId, useMemo, useState } from "react";

import { listSharingAudienceRoles, type SharingAudienceRoleOption } from "@hiveforyou/domain-packs";
import type { CaseCustomerContextIntake } from "@hiveforyou/shared/case-customer-context";
import {
  uniqueDomainIds,
  type DiscoverCollectionUnderstanding,
  type DiscoverQuestion,
  type ProposedDomainGroup,
} from "@hiveforyou/shared/discover";

const SOMETHING_ELSE_ID = "objective.something_else";
const JUST_FOR_ME_ID = "audience.just_for_me";
const SOMEONE_ELSE_ID = "audience.someone_else";
const OBJECTIVE_KEY = "discovery.objective";

type Phase = "overview" | "objective" | "audience";

type DomainDraft = {
  selectedObjectiveId: string | null;
  objectiveText: string;
  audience: string | null;
  otherRole: string;
};

export type DiscoveryObjectiveIntakeContentProps = {
  objectiveQuestions: DiscoverQuestion[];
  collectionUnderstanding?: DiscoverCollectionUnderstanding;
  audienceRoles: SharingAudienceRoleOption[];
  submitting: boolean;
  onSubmit: (payload: {
    intake: CaseCustomerContextIntake;
    objectiveAnswers: { questionId: string; answer: Record<string, unknown> }[];
  }) => void;
};

function domainIdFromQuestion(question: DiscoverQuestion): string | null {
  const prefix = `${OBJECTIVE_KEY}.`;
  if (!question.questionKey.startsWith(prefix)) {
    return null;
  }
  const domainId = question.questionKey.slice(prefix.length).trim();
  return domainId.length > 0 ? domainId : null;
}

function uniqueDomains(groups: ProposedDomainGroup[]): ProposedDomainGroup[] {
  const seen = new Set<string>();
  const domains: ProposedDomainGroup[] = [];
  for (const group of groups) {
    const domainId = group.domainId.trim();
    if (!domainId || seen.has(domainId)) {
      continue;
    }
    seen.add(domainId);
    domains.push(group);
  }
  return domains;
}

function documentCount(groups: ProposedDomainGroup[], domainId: string): number {
  const ids = new Set<string>();
  for (const group of groups) {
    if (group.domainId.trim() !== domainId) {
      continue;
    }
    for (const id of group.logicalDocumentIds) {
      ids.add(id);
    }
  }
  return ids.size;
}

function emptyDraft(): DomainDraft {
  return {
    selectedObjectiveId: null,
    objectiveText: "",
    audience: null,
    otherRole: "",
  };
}

export function DiscoveryObjectiveIntakeContent({
  objectiveQuestions,
  collectionUnderstanding,
  audienceRoles,
  submitting,
  onSubmit,
}: DiscoveryObjectiveIntakeContentProps) {
  const titleId = useId();
  const groups = collectionUnderstanding?.domainGroups ?? [];
  const domains = uniqueDomains(groups);
  const multiDomain = uniqueDomainIds(domains).length > 1;
  const [phase, setPhase] = useState<Phase>(multiDomain ? "overview" : "objective");
  const [domainIndex, setDomainIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, DomainDraft>>({});

  const activeDomain = domains[domainIndex];
  const activeQuestion = useMemo(() => {
    if (activeDomain) {
      return (
        objectiveQuestions.find(
          (question) => domainIdFromQuestion(question) === activeDomain.domainId,
        ) ?? (objectiveQuestions.length === 1 ? objectiveQuestions[0] : undefined)
      );
    }
    return objectiveQuestions[0];
  }, [activeDomain, objectiveQuestions]);

  const draftKey = activeDomain?.domainId ?? activeQuestion?.id ?? "objective";
  const draft = drafts[draftKey] ?? emptyDraft();

  function updateDraft(patch: Partial<DomainDraft>) {
    setDrafts((current) => ({
      ...current,
      [draftKey]: { ...(current[draftKey] ?? emptyDraft()), ...patch },
    }));
  }

  const audienceOptions = useMemo(() => {
    const packRoles = activeDomain
      ? listSharingAudienceRoles({
          domainResolved: true,
          domainId: activeDomain.domainId,
          domainLabel: activeDomain.domainLabel,
        })
      : audienceRoles;
    const fromModel = (activeDomain?.suggestedAudiences ?? []).map((item) => ({
      roleId: item.id,
      label: item.label,
      allowsFreeText: false,
    }));
    const merged = [...fromModel];
    for (const role of packRoles) {
      if (!merged.some((item) => item.roleId === role.roleId || item.label === role.label)) {
        merged.push(role);
      }
    }
    if (!merged.some((item) => item.roleId === JUST_FOR_ME_ID || /just for me/i.test(item.label))) {
      merged.unshift({ roleId: JUST_FOR_ME_ID, label: "Just for me", allowsFreeText: false });
    }
    if (!merged.some((item) => item.roleId === SOMEONE_ELSE_ID || item.label === "Someone else")) {
      merged.push({ roleId: SOMEONE_ELSE_ID, label: "Someone else", allowsFreeText: false });
    }
    return merged;
  }, [activeDomain, audienceRoles]);

  const selectedAudience = audienceOptions.find((role) => role.roleId === draft.audience) ?? null;
  const selectedAudienceNeedsOtherText =
    selectedAudience != null &&
    (selectedAudience.roleId === SOMEONE_ELSE_ID ||
      selectedAudience.roleId === "aud-other" ||
      selectedAudience.allowsFreeText);

  function isJustForMeAudience(role: { roleId: string; label: string }): boolean {
    return (
      role.roleId === JUST_FOR_ME_ID ||
      role.roleId === "aud-self" ||
      /just for me/i.test(role.label)
    );
  }

  function questionForDomain(domain: ProposedDomainGroup): DiscoverQuestion | undefined {
    return (
      objectiveQuestions.find((question) => domainIdFromQuestion(question) === domain.domainId) ??
      (domains.length === 1 ? objectiveQuestions[0] : undefined)
    );
  }

  function submitFlow() {
    const objectiveAnswers: { questionId: string; answer: Record<string, unknown> }[] = [];
    const intakeDomains: CaseCustomerContextIntake["domains"] = [];
    const walk = domains.length > 0 ? domains : [];

    if (!walk.length && activeQuestion && draft.objectiveText.trim() && selectedAudience) {
      const text = draft.objectiveText.trim();
      objectiveAnswers.push({
        questionId: activeQuestion.id,
        answer:
          draft.selectedObjectiveId && draft.selectedObjectiveId !== SOMETHING_ELSE_ID
            ? { choiceId: draft.selectedObjectiveId, text }
            : { choiceId: SOMETHING_ELSE_ID, customText: text, text },
      });
      const shareIntent = isJustForMeAudience(selectedAudience) ? "no" : "yes";
      intakeDomains.push({
        domainId: domainIdFromQuestion(activeQuestion) ?? "case",
        objective: text,
        shareIntent,
        ...(shareIntent === "yes"
          ? {
              intendedAudienceRoleId: selectedAudience.roleId,
              ...(selectedAudienceNeedsOtherText
                ? { intendedAudienceOtherRole: draft.otherRole.trim() || selectedAudience.label.trim() }
                : {}),
            }
          : {}),
      });
    }

    for (const domain of walk) {
      const question = questionForDomain(domain);
      const domainDraft = drafts[domain.domainId] ?? emptyDraft();
      const text = domainDraft.objectiveText.trim();
      const audience = audienceOptionsFor(domain, audienceRoles).find(
        (role) => role.roleId === domainDraft.audience,
      );
      if (!question || !text || !audience) {
        return;
      }
      objectiveAnswers.push({
        questionId: question.id,
        answer:
          domainDraft.selectedObjectiveId && domainDraft.selectedObjectiveId !== SOMETHING_ELSE_ID
            ? { choiceId: domainDraft.selectedObjectiveId, text }
            : { choiceId: SOMETHING_ELSE_ID, customText: text, text },
      });
      const shareIntent = isJustForMeAudience(audience) ? "no" : "yes";
      const needsOther =
        audience.roleId === SOMEONE_ELSE_ID ||
        audience.roleId === "aud-other" ||
        audience.allowsFreeText;
      intakeDomains.push({
        domainId: domain.domainId,
        objective: text,
        shareIntent,
        ...(shareIntent === "yes"
          ? {
              intendedAudienceRoleId: audience.roleId,
              ...(needsOther
                ? { intendedAudienceOtherRole: domainDraft.otherRole.trim() || audience.label.trim() }
                : {}),
            }
          : {}),
      });
    }

    if (!intakeDomains.length) {
      return;
    }
    onSubmit({
      intake: { domains: intakeDomains },
      objectiveAnswers,
    });
  }

  function goNextFromAudience() {
    if (domainIndex < domains.length - 1) {
      setDomainIndex((index) => index + 1);
      setPhase("objective");
      return;
    }
    submitFlow();
  }

  const objectiveOptions = activeQuestion?.options ?? [];
  const domainHeading = activeDomain
    ? `${activeDomain.domainLabel} · ${documentCount(groups, activeDomain.domainId)} documents`
    : null;

  return (
    <div data-testid="discovery-objective-intake">
      {phase === "overview" && multiDomain ? (
        <>
          <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-hive-blue sm:text-xs">
            What Hive found
          </p>
          <h2 id={titleId} className="mt-1.5 font-serif text-xl font-semibold text-hive-navy sm:text-2xl">
            I found a few different areas in your documents
          </h2>
          <ul className="mt-4 space-y-2">
            {domains.map((group) => (
              <li
                key={group.domainId}
                className="rounded-hive-lg border border-hive-border/80 bg-hive-soft-sky/20 px-3 py-2"
              >
                <p className="font-sans text-sm text-hive-navy">
                  <span className="font-semibold">{group.domainLabel}</span>
                  <span className="text-hive-blue">
                    {" "}
                    · {documentCount(groups, group.domainId)} document
                    {documentCount(groups, group.domainId) === 1 ? "" : "s"}
                  </span>
                </p>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setDomainIndex(0);
              setPhase("objective");
            }}
            className="mt-5 w-full rounded-hive-lg bg-hive-navy px-4 py-2.5 font-sans text-sm font-semibold text-white disabled:opacity-60"
          >
            Continue
          </button>
        </>
      ) : null}

      {phase === "objective" && activeQuestion ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.objectiveText.trim()) {
              return;
            }
            setPhase("audience");
          }}
        >
          <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-hive-blue sm:text-xs">
            Your goal
          </p>
          {domainHeading ? (
            <p className="mt-1 font-sans text-sm font-semibold text-hive-navy">{domainHeading}</p>
          ) : null}
          <h2 id={titleId} className="mt-1.5 font-serif text-xl font-semibold text-hive-navy sm:text-2xl">
            What would you like Hive to help you accomplish?
          </h2>
          {activeQuestion.humanReason ? (
            <p className="mt-1 font-sans text-xs text-hive-text-muted sm:text-sm">
              {activeQuestion.humanReason}
            </p>
          ) : null}
          <fieldset className="mt-4 space-y-1.5">
            {objectiveOptions.map((option) => (
              <label
                key={option.id}
                className="flex cursor-pointer items-start gap-2 rounded-hive-md border border-hive-border/80 px-3 py-2 font-sans text-sm text-hive-blue"
              >
                <input
                  type="radio"
                  name={`discovery-objective-${draftKey}`}
                  value={option.id}
                  checked={draft.selectedObjectiveId === option.id}
                  onChange={() =>
                    updateDraft({
                      selectedObjectiveId: option.id,
                      objectiveText:
                        option.id === SOMETHING_ELSE_ID ? "" : option.label,
                    })
                  }
                  className="mt-0.5"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
          {draft.selectedObjectiveId && draft.selectedObjectiveId !== SOMETHING_ELSE_ID ? (
            <label className="mt-3 block font-sans text-sm text-hive-navy">
              Edit this goal
              <input
                type="text"
                value={draft.objectiveText}
                onChange={(event) => updateDraft({ objectiveText: event.target.value })}
                className="mt-1 w-full rounded-hive-lg border border-hive-border px-3 py-2 text-sm"
              />
            </label>
          ) : null}
          {draft.selectedObjectiveId === SOMETHING_ELSE_ID ? (
            <textarea
              rows={3}
              value={draft.objectiveText}
              onChange={(event) => updateDraft({ objectiveText: event.target.value })}
              className="mt-3 w-full rounded-hive-lg border border-hive-border px-3 py-2 font-sans text-sm text-hive-navy"
              placeholder="Describe what you want Hive to help you accomplish…"
              required
            />
          ) : null}
          <div className="mt-4 flex gap-2">
            {multiDomain ? (
              <button
                type="button"
                onClick={() => {
                  if (domainIndex === 0) {
                    setPhase("overview");
                    return;
                  }
                  setDomainIndex((index) => index - 1);
                  setPhase("audience");
                }}
                className="w-full rounded-hive-lg border border-hive-border px-4 py-2.5 font-sans text-sm font-semibold text-hive-navy"
              >
                Back
              </button>
            ) : null}
            <button
              type="submit"
              disabled={submitting || !draft.objectiveText.trim()}
              className="w-full rounded-hive-lg bg-hive-navy px-4 py-2.5 font-sans text-sm font-semibold text-white disabled:opacity-60"
            >
              Continue
            </button>
          </div>
        </form>
      ) : null}

      {phase === "audience" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            goNextFromAudience();
          }}
        >
          <p className="font-mono text-[10px] font-medium uppercase tracking-wide text-hive-blue sm:text-xs">
            Audience
          </p>
          {domainHeading ? (
            <p className="mt-1 font-sans text-sm font-semibold text-hive-navy">{domainHeading}</p>
          ) : null}
          {draft.objectiveText.trim() ? (
            <p className="mt-1 font-sans text-xs text-hive-text-muted">
              Objective: {draft.objectiveText.trim()}
            </p>
          ) : null}
          <h2 className="mt-1.5 font-serif text-xl font-semibold text-hive-navy sm:text-2xl">
            Who is this primarily for?
          </h2>
          <fieldset className="mt-4 space-y-1.5" data-testid="discovery-audience-options">
            {audienceOptions.map((option) => (
              <label
                key={option.roleId}
                className="flex cursor-pointer items-start gap-2 rounded-hive-md border border-hive-border/80 px-3 py-2 font-sans text-sm text-hive-blue"
              >
                <input
                  type="radio"
                  name={`intended-audience-${draftKey}`}
                  value={option.roleId}
                  checked={draft.audience === option.roleId}
                  onChange={() => updateDraft({ audience: option.roleId })}
                  required
                  className="mt-0.5"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
          {selectedAudienceNeedsOtherText ? (
            <label className="mt-3 block font-sans text-sm text-hive-navy">
              Role or relationship
              <input
                type="text"
                value={draft.otherRole}
                onChange={(event) => updateDraft({ otherRole: event.target.value })}
                required
                className="mt-1 w-full rounded-hive-lg border border-hive-border px-3 py-2 text-sm"
                placeholder="e.g. family member, coach, employer…"
              />
            </label>
          ) : null}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setPhase("objective")}
              className="w-full rounded-hive-lg border border-hive-border px-4 py-2.5 font-sans text-sm font-semibold text-hive-navy"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                !selectedAudience ||
                (selectedAudienceNeedsOtherText && !draft.otherRole.trim())
              }
              className="w-full rounded-hive-lg bg-hive-navy px-4 py-2.5 font-sans text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting && domainIndex >= domains.length - 1 ? "Saving…" : "Continue"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function audienceOptionsFor(
  domain: ProposedDomainGroup,
  fallbackRoles: SharingAudienceRoleOption[],
) {
  const packRoles = listSharingAudienceRoles({
    domainResolved: true,
    domainId: domain.domainId,
    domainLabel: domain.domainLabel,
  });
  const roles = packRoles.length > 0 ? packRoles : fallbackRoles;
  const fromModel = (domain.suggestedAudiences ?? []).map((item) => ({
    roleId: item.id,
    label: item.label,
    allowsFreeText: false,
  }));
  const merged = [...fromModel];
  for (const role of roles) {
    if (!merged.some((item) => item.roleId === role.roleId || item.label === role.label)) {
      merged.push(role);
    }
  }
  if (!merged.some((item) => item.roleId === JUST_FOR_ME_ID || /just for me/i.test(item.label))) {
    merged.unshift({ roleId: JUST_FOR_ME_ID, label: "Just for me", allowsFreeText: false });
  }
  if (!merged.some((item) => item.roleId === SOMEONE_ELSE_ID || item.label === "Someone else")) {
    merged.push({ roleId: SOMEONE_ELSE_ID, label: "Someone else", allowsFreeText: false });
  }
  return merged;
}
