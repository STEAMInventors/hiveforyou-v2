"use client";

import type { CSSProperties } from "react";

/** Artifact layout: hexes loop in until the hive is ready; colors accumulate with progress. */
const CELLS: Array<{
  tx: number;
  ty: number;
  delay: number;
  dy: string;
  rot: string;
  colorClass: string;
  center?: boolean;
}> = [
  { tx: 39.6, ty: 51.8, delay: 0, dy: "-10px", rot: "-90deg", colorClass: "hf-c0" },
  { tx: 39.6, ty: 98.2, delay: 0.34, dy: "0px", rot: "-120deg", colorClass: "hf-c1" },
  { tx: 53.0, ty: 75.0, delay: 0.68, dy: "-40px", rot: "90deg", colorClass: "hf-c2" },
  { tx: 66.4, ty: 51.8, delay: 1.02, dy: "-40px", rot: "-60deg", colorClass: "hf-c3" },
  { tx: 66.4, ty: 98.2, delay: 1.36, dy: "12px", rot: "-120deg", colorClass: "hf-c0" },
  { tx: 79.9, ty: 75.0, delay: 1.7, dy: "12px", rot: "-90deg", colorClass: "hf-c1" },
  { tx: 93.3, ty: 51.8, delay: 2.04, dy: "-40px", rot: "-120deg", colorClass: "hf-c2" },
  { tx: 93.3, ty: 98.2, delay: 2.38, dy: "0px", rot: "60deg", colorClass: "hf-c3" },
  {
    tx: 106.7,
    ty: 75.0,
    delay: 2.72,
    dy: "-40px",
    rot: "-90deg",
    colorClass: "",
    center: true,
  },
  { tx: 120.1, ty: 51.8, delay: 3.06, dy: "-40px", rot: "90deg", colorClass: "hf-c1" },
  { tx: 120.1, ty: 98.2, delay: 3.4, dy: "0px", rot: "-120deg", colorClass: "hf-c2" },
  { tx: 133.6, ty: 75.0, delay: 3.74, dy: "40px", rot: "90deg", colorClass: "hf-c3" },
  { tx: 147.0, ty: 51.8, delay: 4.08, dy: "-40px", rot: "-90deg", colorClass: "hf-c0" },
  { tx: 147.0, ty: 98.2, delay: 4.42, dy: "26px", rot: "90deg", colorClass: "hf-c1" },
  { tx: 160.4, ty: 75.0, delay: 4.76, dy: "-40px", rot: "90deg", colorClass: "hf-c2" },
];

const COLOR_CELL_COUNT = CELLS.filter((cell) => !cell.center).length;

const HEX =
  "0.0,-14.5 12.6,-7.2 12.6,7.2 0.0,14.5 -12.6,7.2 -12.6,-7.2";

type HiveFlyingHoneycombProps = {
  animationKey?: string | number;
  /** 0–1: how many hexes have taken on brand color while still hiving. */
  colorProgress?: number;
  done?: boolean;
};

export function HiveFlyingHoneycomb({
  animationKey,
  colorProgress = 0,
  done = false,
}: HiveFlyingHoneycombProps) {
  const progress = done ? 1 : Math.min(1, Math.max(0, colorProgress));
  const litCount = done ? COLOR_CELL_COUNT : Math.floor(progress * COLOR_CELL_COUNT);
  const nextCellFade = done ? 1 : (progress * COLOR_CELL_COUNT) % 1;

  let colorIndex = 0;

  return (
    <svg
      key={animationKey}
      viewBox="0 0 200 150"
      width={220}
      height={165}
      aria-hidden
      style={{ alignSelf: "center", overflow: "visible" }}
      data-testid="hive-flying-honeycomb"
    >
      <g className="hf-comb">
        {CELLS.map((cell) => {
          const key = `${cell.tx}-${cell.ty}`;
          if (cell.center) {
            return (
              <g key={key} transform={`translate(${cell.tx} ${cell.ty})`}>
                <g
                  className="hf-fly"
                  style={
                    {
                      animationDelay: `${cell.delay}s`,
                      ["--hf-dy" as string]: cell.dy,
                      ["--hf-rot" as string]: cell.rot,
                    } as CSSProperties
                  }
                >
                  <polygon
                    className="hf-hex"
                    points={HEX}
                    fill="#0D0D0D"
                    stroke="#0D0D0D"
                    strokeWidth={1.6}
                    strokeLinejoin="round"
                  />
                  <path
                    d="M-6 -2.5h12M-6 3.5h7"
                    stroke="#fff"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </g>
              </g>
            );
          }

          const order = colorIndex;
          colorIndex += 1;
          const lit = order < litCount;
          const fadingIn = !done && order === litCount && nextCellFade > 0.05;

          return (
            <g key={key} transform={`translate(${cell.tx} ${cell.ty})`}>
              <g
                className="hf-fly"
                style={
                  {
                    animationDelay: `${cell.delay}s`,
                    ["--hf-dy" as string]: cell.dy,
                    ["--hf-rot" as string]: cell.rot,
                  } as CSSProperties
                }
              >
                <polygon
                  className={`hf-hex ${cell.colorClass}${lit || fadingIn ? " hf-lit" : ""}`}
                  points={HEX}
                  fill="#fff"
                  stroke="#0D0D0D"
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                  style={
                    fadingIn
                      ? ({ ["--hf-lit-mix" as string]: nextCellFade } as CSSProperties)
                      : undefined
                  }
                />
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
