"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export type StageKey = "trigger" | "formation" | "migration" | "resolution";

export const STAGES: ReadonlyArray<{
  key: StageKey;
  name: string;
  color: string;
  title: string;
  text: string;
}> = [
  {
    key: "trigger",
    name: "Trigger",
    color: "#4285F4",
    title: "Your documents arrive",
    text: "Hive opens each file and works out what it is — an IEP, an evaluation, a progress report.",
  },
  {
    key: "formation",
    name: "Formation",
    color: "#EA4335",
    title: "Facts rise to the surface",
    text: "Dates, goals, services and scores are lifted out, each one tied to the page it came from.",
  },
  {
    key: "migration",
    name: "Migration",
    color: "#FBBC05",
    title: "Facts move and connect",
    text: "The same thing is lined up across documents, so Hive can see what changed and what disagrees.",
  },
  {
    key: "resolution",
    name: "Resolution",
    color: "#34A853",
    title: "Everything settles",
    text: "You get one clear picture. Your original files stay exactly as you uploaded them.",
  },
];

export const MODAL1_PHASES = ["trigger", "formation", "complete"] as const;
export const MODAL2_PHASES = ["migration", "resolution", "complete"] as const;

export type Modal1Phase = (typeof MODAL1_PHASES)[number];
export type Modal2Phase = (typeof MODAL2_PHASES)[number];

/** Minimum time a stage stays on screen once an event is allowed to advance it. */
export const STAGE_HOLD_MS = 1500;

/**
 * Walks toward `target` one phase at a time. A step waits until the current
 * phase has been visible for STAGE_HOLD_MS and the target event has arrived.
 */
export function useHeldPhase<T extends string>(target: T, order: readonly T[]): T {
  const [shown, setShown] = useState(order[0] as T);
  const shownAt = useRef(Date.now());

  useEffect(() => {
    const shownIndex = order.indexOf(shown);
    const targetIndex = order.indexOf(target);
    if (shownIndex < 0 || targetIndex < 0) {
      return;
    }
    if (targetIndex < shownIndex) {
      shownAt.current = Date.now();
      setShown(target);
      return;
    }
    if (targetIndex === shownIndex) {
      return;
    }
    const next = order[shownIndex + 1];
    if (!next) {
      return;
    }
    const wait = Math.max(0, STAGE_HOLD_MS - (Date.now() - shownAt.current));
    const timeout = window.setTimeout(() => {
      shownAt.current = Date.now();
      setShown(next);
    }, wait);
    return () => window.clearTimeout(timeout);
  }, [order, shown, target]);

  return shown;
}

export function useLifecycleModalEffects(
  running: boolean,
  buttonRef: RefObject<HTMLButtonElement | null>,
) {
  useEffect(() => {
    if (running) {
      return;
    }
    buttonRef.current?.focus();
  }, [buttonRef, running]);

  useEffect(() => {
    if (!running) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [running]);
}
