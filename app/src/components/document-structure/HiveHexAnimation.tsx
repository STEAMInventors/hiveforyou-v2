"use client";

type HiveHexAnimationProps = {
  className?: string;
};

export function HiveHexAnimation({ className = "" }: HiveHexAnimationProps) {
  return (
    <div
      className={`relative flex h-28 w-28 items-center justify-center motion-safe:animate-hive-hex-pulse ${className}`}
      aria-hidden
      data-testid="hive-hex-animation"
    >
      <svg viewBox="0 0 120 120" className="h-full w-full text-hive-sage/90">
        <g fill="none" stroke="currentColor" strokeWidth="1.5">
          <polygon
            points="60,8 98,30 98,74 60,96 22,74 22,30"
            className="opacity-90"
          />
          <polygon
            points="60,22 86,37 86,67 60,82 34,67 34,37"
            className="opacity-50 motion-safe:animate-hive-hex-inner"
          />
          <polygon
            points="60,36 74,44 74,60 60,68 46,60 46,44"
            className="fill-hive-soft-sky/80 stroke-hive-sage/60"
          />
        </g>
      </svg>
      <span className="pointer-events-none absolute inset-0 rounded-full bg-hive-sage/10 blur-xl motion-safe:animate-pulse" />
    </div>
  );
}
