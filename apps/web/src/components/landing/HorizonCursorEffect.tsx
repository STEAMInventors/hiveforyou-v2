"use client";

import { useEffect } from "react";

export function HorizonCursorEffect() {
  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      document.querySelectorAll(".cursor-reactive-container").forEach((container) => {
        const el = container.querySelector(".cursor-reactive") as HTMLElement | null;
        if (!el) {
          return;
        }
        const rect = container.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;

        if (
          event.clientY >= rect.top - window.innerHeight &&
          event.clientY <= rect.bottom + window.innerHeight
        ) {
          el.style.setProperty("--mouse-x", `${x}%`);
          el.style.setProperty("--mouse-y", `${y}%`);
        }
      });
    }

    document.addEventListener("mousemove", onMouseMove);
    return () => document.removeEventListener("mousemove", onMouseMove);
  }, []);

  return null;
}
