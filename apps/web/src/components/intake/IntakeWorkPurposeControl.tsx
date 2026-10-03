"use client";

import { CirclePlus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { listDomainPacksByCapability } from "@hiveforyou/domain-packs";

import {
  isDescribedIntentReady,
  PURPOSE_DESCRIBED_PLACEHOLDER,
  PURPOSE_DESCRIBED_PROMPT,
  PURPOSE_MENU_PROMPT,
  purposeTriggerLabel,
  type IntakeWorkPurpose,
} from "@/lib/intake/intake-work-purpose";

type Panel = "closed" | "menu" | "described-edit";

type IntakeWorkPurposeControlProps = {
  purpose: IntakeWorkPurpose | null;
  onPurposeChange: (purpose: IntakeWorkPurpose | null) => void;
};

const MENU_OPTIONS = listDomainPacksByCapability("intake.work-purpose").map((pack) => ({
  domainId: pack.id,
  label: pack.name,
  testId: `intake-purpose-option-${pack.id}`,
}));

function focusMenuItem(container: HTMLElement | null, index: number) {
  if (!container) {
    return;
  }
  const items = container.querySelectorAll<HTMLElement>('[role="menuitem"]');
  const item = items[index];
  item?.focus();
}

export function IntakeWorkPurposeControl({
  purpose,
  onPurposeChange,
}: IntakeWorkPurposeControlProps) {
  const menuId = useId();
  const describedRegionId = useId();
  const [panel, setPanel] = useState<Panel>("closed");
  const [describedDraft, setDescribedDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const describedInputRef = useRef<HTMLTextAreaElement>(null);

  const closePanel = useCallback(() => {
    setPanel("closed");
    triggerRef.current?.focus();
  }, []);

  const openMenu = useCallback(() => {
    setPanel("menu");
  }, []);

  const selectDomain = useCallback(
    (selectedDomainId: string) => {
      onPurposeChange({ mode: "DOMAIN", selectedDomainId });
      closePanel();
    },
    [closePanel, onPurposeChange],
  );

  const beginDescribedEdit = useCallback(() => {
    setDescribedDraft(purpose?.mode === "DESCRIBED" ? purpose.rawIntent : "");
    setPanel("described-edit");
  }, [purpose]);

  const confirmDescribed = useCallback(() => {
    const rawIntent = describedDraft.trim();
    if (!isDescribedIntentReady(describedDraft)) {
      return;
    }
    onPurposeChange({ mode: "DESCRIBED", rawIntent });
    setPanel("closed");
    triggerRef.current?.focus();
  }, [describedDraft, onPurposeChange]);

  const cancelDescribedEdit = useCallback(() => {
    setDescribedDraft("");
    setPanel("closed");
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (panel === "menu") {
      requestAnimationFrame(() => focusMenuItem(menuRef.current, 0));
    }
    if (panel === "described-edit") {
      requestAnimationFrame(() => describedInputRef.current?.focus());
    }
  }, [panel]);

  useEffect(() => {
    if (panel === "closed") {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      const root = rootRef.current;
      if (!root || root.contains(event.target as Node)) {
        return;
      }
      if (panel === "menu") {
        closePanel();
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (panel === "described-edit") {
          cancelDescribedEdit();
        } else {
          closePanel();
        }
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [cancelDescribedEdit, closePanel, panel]);

  const onTriggerClick = () => {
    if (panel === "menu") {
      closePanel();
      return;
    }
    if (panel === "described-edit") {
      return;
    }
    openMenu();
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const container = menuRef.current;
    if (!container) {
      return;
    }
    const items = container.querySelectorAll<HTMLElement>('[role="menuitem"]');
    const count = items.length;
    if (count === 0) {
      return;
    }
    const currentIndex = Array.from(items).findIndex((item) => item === document.activeElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = currentIndex < 0 ? 0 : (currentIndex + 1) % count;
      focusMenuItem(container, next);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = currentIndex < 0 ? count - 1 : (currentIndex - 1 + count) % count;
      focusMenuItem(container, next);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusMenuItem(container, 0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusMenuItem(container, count - 1);
    }
  };

  const continueDisabled = !isDescribedIntentReady(describedDraft);

  return (
    <div
      ref={rootRef}
      className="relative flex w-full flex-col items-center"
      data-testid="intake-work-purpose-control"
    >
      {panel !== "described-edit" ? (
        <button
          ref={triggerRef}
          type="button"
          className="inline-flex max-w-full items-center gap-2 rounded-hive-lg border border-transparent px-3 py-2 font-sans text-base text-hive-blue transition-colors hover:border-hive-border hover:bg-hive-surface/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hive-blue"
          data-testid="intake-work-purpose-trigger"
          aria-expanded={panel === "menu"}
          aria-haspopup="menu"
          aria-controls={panel === "menu" ? menuId : undefined}
          onClick={onTriggerClick}
        >
          <CirclePlus className="h-5 w-5 shrink-0 text-hive-blue" strokeWidth={2} aria-hidden />
          {purpose?.mode === "DESCRIBED" ? (
            <span className="flex min-w-0 flex-col items-start text-left">
              <span className="font-medium text-hive-navy">Other</span>
              <span className="text-sm text-hive-blue">&ldquo;{purpose.rawIntent}&rdquo;</span>
            </span>
          ) : (
            <span className="text-hive-navy">
              {purposeTriggerLabel(
                purpose,
                purpose?.mode === "DOMAIN"
                  ? MENU_OPTIONS.find((option) => option.domainId === purpose.selectedDomainId)?.label
                  : undefined,
              )}
            </span>
          )}
        </button>
      ) : null}

      {panel === "menu" ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={PURPOSE_MENU_PROMPT}
          data-testid="intake-purpose-menu"
          className="absolute top-full z-10 mt-2 w-full min-w-[16rem] max-w-md rounded-hive-lg border border-hive-border bg-hive-surface p-2 shadow-hive"
          onKeyDown={onMenuKeyDown}
        >
          <p className="px-3 py-2 font-sans text-sm font-medium text-hive-navy">
            {PURPOSE_MENU_PROMPT}
          </p>
          <ul className="flex flex-col gap-0.5">
            {MENU_OPTIONS.map((option) => (
              <li key={option.domainId}>
                <button
                  type="button"
                  role="menuitem"
                  data-testid={option.testId}
                  className="w-full rounded-hive-md px-3 py-2.5 text-left font-sans text-base text-hive-navy transition-colors hover:bg-hive-soft-sky/40 focus-visible:bg-hive-soft-sky/40 focus-visible:outline-none"
                  onClick={() => selectDomain(option.domainId)}
                >
                  {option.label}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                role="menuitem"
                data-testid="intake-purpose-option-other"
                className="w-full rounded-hive-md px-3 py-2.5 text-left font-sans text-base text-hive-navy transition-colors hover:bg-hive-soft-sky/40 focus-visible:bg-hive-soft-sky/40 focus-visible:outline-none"
                onClick={beginDescribedEdit}
              >
                Other...
              </button>
            </li>
          </ul>
        </div>
      ) : null}

      {panel === "described-edit" ? (
        <div
          id={describedRegionId}
          role="region"
          aria-label={PURPOSE_DESCRIBED_PROMPT}
          data-testid="intake-purpose-described-panel"
          className="w-full rounded-hive-lg border border-hive-border bg-hive-surface px-4 py-4 text-left"
        >
          <p className="font-sans text-base font-medium text-hive-navy">{PURPOSE_DESCRIBED_PROMPT}</p>
          <textarea
            ref={describedInputRef}
            data-testid="intake-purpose-other-input"
            className="mt-3 w-full resize-none rounded-hive-md border border-hive-border bg-white px-3 py-2 font-sans text-base text-hive-navy placeholder:text-hive-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-hive-blue"
            rows={3}
            placeholder={PURPOSE_DESCRIBED_PLACEHOLDER}
            value={describedDraft}
            onChange={(event) => setDescribedDraft(event.target.value)}
          />
          <div className="mt-4 flex justify-end gap-3">
            <button
              type="button"
              data-testid="intake-purpose-other-cancel"
              className="rounded-hive-md px-4 py-2 font-sans text-sm font-semibold text-hive-navy hover:bg-hive-soft-sky/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hive-blue"
              onClick={cancelDescribedEdit}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="intake-purpose-other-continue"
              disabled={continueDisabled}
              className="rounded-hive-md bg-hive-navy px-4 py-2 font-sans text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:enabled:bg-hive-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hive-blue"
              onClick={confirmDescribed}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
