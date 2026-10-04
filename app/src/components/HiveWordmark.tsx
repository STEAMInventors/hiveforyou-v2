"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { brandLogoSize } from "@/lib/brand/sizes";
import { brand } from "@/lib/brand/paths";
import { resetIntakeHomeSession } from "@/lib/intake/intake-client";
import { useStagedDocuments } from "@/lib/intake/staged-documents-context";

type HiveWordmarkProps = {
  className?: string;
  size?: "header" | "footer";
};

type HiveAppLogoProps = {
  className?: string;
  linkHome?: boolean;
  /** `lockup` = mark + wordmark only. `mark` = hex only. `responsive` = mark &lt;400px, lockup otherwise. */
  display?: "lockup" | "mark" | "responsive";
};

const headerH = brandLogoSize.headerHeightPx;

const logoLockupStyle = { height: headerH, width: "auto", maxHeight: headerH, display: "block" as const };
const logoMarkStyle = {
  height: headerH,
  width: headerH,
  maxHeight: headerH,
  maxWidth: headerH,
  display: "block" as const,
};

function HiveHomeLink({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { clearDocuments } = useStagedDocuments();

  return (
    <Link
      href="/"
      data-testid="hive-home-link"
      aria-label="Back to start"
      className={`inline-flex shrink-0 cursor-pointer no-underline ${className ?? ""}`.trim()}
      onClick={() => {
        resetIntakeHomeSession();
        if (pathname !== "/") {
          clearDocuments();
          router.push("/");
        }
      }}
    >
      {children}
    </Link>
  );
}

/** Full lockup ≥400px wide; mark only below (brand guide). Sizes enforced inline (SVG intrinsic size is huge). */
export function HiveAppLogo({
  className = "",
  linkHome = false,
  display = "responsive",
}: HiveAppLogoProps) {
  const inner =
    display === "lockup" ? (
      <span className={`inline-flex items-center ${className}`.trim()}>
        <img
          src={brand.logo}
          alt="HiveForYou"
          style={logoLockupStyle}
          className="hfy-brand-header-logo"
        />
      </span>
    ) : display === "mark" ? (
      <span className={`inline-flex items-center ${className}`.trim()}>
        <img
          src={brand.mark}
          alt="HiveForYou"
          style={logoMarkStyle}
          className="hfy-brand-header-mark"
        />
      </span>
    ) : (
      <span className={`inline-flex items-center ${className}`.trim()}>
        <img
          src={brand.logo}
          alt="HiveForYou"
          style={logoLockupStyle}
          className="hfy-brand-header-logo hidden min-[400px]:block"
        />
        <img
          src={brand.mark}
          alt="HiveForYou"
          style={logoMarkStyle}
          className="hfy-brand-header-mark block min-[400px]:hidden"
        />
      </span>
    );

  if (linkHome) {
    return <HiveHomeLink>{inner}</HiveHomeLink>;
  }
  return inner;
}

export function HiveWordmark({ className = "", size = "header" }: HiveWordmarkProps) {
  if (size === "footer") {
    const fh = brandLogoSize.footerWordmarkHeightPx;
    return (
      <img
        src={brand.wordmark}
        alt="HiveForYou"
        style={{ height: fh, width: "auto", maxHeight: fh, display: "block" }}
        className={`hfy-brand-wordmark-footer ${className}`.trim()}
      />
    );
  }
  return <HiveAppLogo className={className} />;
}

export function HiveBrandMark({
  className = "",
  variant = "standalone",
}: {
  className?: string;
  variant?: "standalone" | "hero" | "footer";
}) {
  const px =
    variant === "hero"
      ? brandLogoSize.markHeroPx
      : variant === "footer"
        ? brandLogoSize.markFooterPx
        : brandLogoSize.markStandalonePx;
  return (
    <img
      src={brand.mark}
      alt=""
      aria-hidden
      style={{ width: px, height: px, maxWidth: px, maxHeight: px, display: "block" }}
      className={`hfy-brand-mark shrink-0 ${className}`.trim()}
    />
  );
}

export function HiveProLogo({
  className = "",
  linkHome = false,
}: {
  className?: string;
  linkHome?: boolean;
}) {
  const h = brandLogoSize.proHeaderHeightPx;
  const img = (
    <img
      src={brand.pro}
      alt="HiveForYou Pro"
      style={{ height: h, width: "auto", maxHeight: h, display: "block" }}
      className={`hfy-brand-pro-logo ${className}`.trim()}
    />
  );
  if (linkHome) {
    return <HiveHomeLink>{img}</HiveHomeLink>;
  }
  return img;
}
