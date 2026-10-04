"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { brand } from "@/lib/brand/paths";

type HfyChipVariant = "default" | "searched" | "you" | "inline" | "lg";

function HfyChipIconTile({ variant }: { variant: HfyChipVariant }) {
  if (variant === "searched" || variant === "you") {
    return <span className="hfy-chip__icon" aria-hidden />;
  }
  return (
    <span className="hfy-chip__icon hfy-chip__icon--brand" aria-hidden>
      <img src={brand.mark} alt="" decoding="async" />
    </span>
  );
}

function chipClass(variant: HfyChipVariant, extra?: string): string {
  const parts = ["hfy-chip"];
  if (variant === "searched") {
    parts.push("hfy-chip--searched");
  } else if (variant === "you") {
    parts.push("hfy-chip--you");
  } else if (variant === "inline") {
    parts.push("hfy-chip--inline");
  } else if (variant === "lg") {
    parts.push("hfy-chip--lg");
  }
  if (extra) {
    parts.push(extra);
  }
  return parts.join(" ");
}

type HfyChipButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: HfyChipVariant;
  children: ReactNode;
};

export function HfyChipButton({
  variant = "default",
  className,
  children,
  type = "button",
  ...rest
}: HfyChipButtonProps) {
  return (
    <button type={type} className={chipClass(variant, className)} {...rest}>
      <HfyChipIconTile variant={variant} />
      <span className="hfy-chip__label">{children}</span>
    </button>
  );
}

type HfyChipStaticProps = {
  variant?: HfyChipVariant;
  className?: string;
  children: ReactNode;
};

export function HfyChipStatic({
  variant = "default",
  className,
  children,
}: HfyChipStaticProps) {
  return (
    <span className={chipClass(variant, className)}>
      <HfyChipIconTile variant={variant} />
      <span className="hfy-chip__label">{children}</span>
    </span>
  );
}
