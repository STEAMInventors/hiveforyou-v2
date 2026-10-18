"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { HiveUiTree } from "@hiveforyou/shared/hive-ui-tree";
import { HIVE_UI_LIVING_CASE_CHAPTER_KEYS } from "@hiveforyou/shared/hive-ui-tree";

import {
  LIVING_CASE_CHAPTER_LABELS,
  LIVING_CASE_CHAPTER_ORDER,
} from "./living-case-chapter-labels";

function chaptersPresentInTree(tree: HiveUiTree): typeof LIVING_CASE_CHAPTER_ORDER {
  const present = new Set<string>();
  for (const element of Object.values(tree.elements)) {
    if (element.type === "LivingCaseChapter") {
      const chapter = (element.props as { chapter: string }).chapter;
      present.add(chapter);
    }
  }
  return LIVING_CASE_CHAPTER_ORDER.filter((chapter) => present.has(chapter));
}

export function LivingCaseChapterNav({ tree }: { tree: HiveUiTree }) {
  const chapters = useMemo(() => chaptersPresentInTree(tree), [tree]);
  const [active, setActive] = useState<(typeof LIVING_CASE_CHAPTER_ORDER)[number] | null>(
    chapters[0] ?? null,
  );

  useEffect(() => {
    if (chapters.length === 0) {
      setActive(null);
      return;
    }
    if (!active || !chapters.includes(active)) {
      setActive(chapters[0] ?? null);
    }
  }, [active, chapters]);

  useEffect(() => {
    if (chapters.length === 0) {
      return;
    }
    const sections = chapters
      .map((chapter) => document.getElementById(`living-case-chapter-${chapter}`))
      .filter((node): node is HTMLElement => node != null);
    if (sections.length === 0) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target.id.replace("living-case-chapter-", "");
        if (
          top &&
          HIVE_UI_LIVING_CASE_CHAPTER_KEYS.includes(top as (typeof HIVE_UI_LIVING_CASE_CHAPTER_KEYS)[number])
        ) {
          setActive(top as (typeof HIVE_UI_LIVING_CASE_CHAPTER_KEYS)[number]);
        }
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5] },
    );
    for (const section of sections) {
      observer.observe(section);
    }
    return () => observer.disconnect();
  }, [chapters]);

  const scrollTo = useCallback((chapter: (typeof LIVING_CASE_CHAPTER_ORDER)[number]) => {
    document.getElementById(`living-case-chapter-${chapter}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setActive(chapter);
  }, []);

  if (chapters.length === 0) {
    return null;
  }

  return (
    <nav className="hir-chapter-nav" aria-label="Report chapters" data-testid="living-case-chapter-nav">
      {chapters.map((chapter) => (
        <button
          key={chapter}
          type="button"
          className={`hir-chapter-nav__item ${active === chapter ? "hir-chapter-nav__item--active" : ""}`}
          aria-current={active === chapter ? "true" : undefined}
          onClick={() => scrollTo(chapter)}
        >
          {LIVING_CASE_CHAPTER_LABELS[chapter]}
        </button>
      ))}
    </nav>
  );
}
