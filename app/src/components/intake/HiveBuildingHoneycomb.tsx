"use client";

const CELL_DELAYS = ["0s", "0.15s", "0.3s", "0.45s", "0.6s", "0.75s", "0.9s"];

export function HiveBuildingHoneycomb({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 180"
      width={168}
      height={151}
      aria-hidden
      className={className}
      style={{ alignSelf: "center", overflow: "visible" }}
    >
      <g className="hf-comb">
        <g transform="translate(100.0 90.0)">
          <polygon
            className="hf-cell"
            points="0.0,-21.0 18.2,-10.5 18.2,10.5 0.0,21.0 -18.2,10.5 -18.2,-10.5"
            fill="#0D0D0D"
            style={{ animationDelay: CELL_DELAYS[0] }}
          />
          <path
            d="M-7 -3h14M-7 4h8"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
            className="hf-cell"
            style={{ animationDelay: CELL_DELAYS[0] }}
          />
        </g>
        <g transform="translate(80.1 55.5)">
          <polygon
            className="hf-cell"
            points="0.0,-21.0 18.2,-10.5 18.2,10.5 0.0,21.0 -18.2,10.5 -18.2,-10.5"
            fill="#4285F4"
            fillOpacity={0.14}
            stroke="#4285F4"
            strokeWidth={2}
            strokeLinejoin="round"
            style={{ animationDelay: CELL_DELAYS[1] }}
          />
        </g>
        <g transform="translate(119.9 55.5)">
          <polygon
            className="hf-cell"
            points="0.0,-21.0 18.2,-10.5 18.2,10.5 0.0,21.0 -18.2,10.5 -18.2,-10.5"
            fill="#EA4335"
            fillOpacity={0.14}
            stroke="#EA4335"
            strokeWidth={2}
            strokeLinejoin="round"
            style={{ animationDelay: CELL_DELAYS[2] }}
          />
        </g>
        <g transform="translate(139.8 90.0)">
          <polygon
            className="hf-cell"
            points="0.0,-21.0 18.2,-10.5 18.2,10.5 0.0,21.0 -18.2,10.5 -18.2,-10.5"
            fill="#FBBC05"
            fillOpacity={0.14}
            stroke="#FBBC05"
            strokeWidth={2}
            strokeLinejoin="round"
            style={{ animationDelay: CELL_DELAYS[3] }}
          />
        </g>
        <g transform="translate(119.9 124.5)">
          <polygon
            className="hf-cell"
            points="0.0,-21.0 18.2,-10.5 18.2,10.5 0.0,21.0 -18.2,10.5 -18.2,-10.5"
            fill="#34A853"
            fillOpacity={0.14}
            stroke="#34A853"
            strokeWidth={2}
            strokeLinejoin="round"
            style={{ animationDelay: CELL_DELAYS[4] }}
          />
        </g>
        <g transform="translate(80.1 124.5)">
          <polygon
            className="hf-cell"
            points="0.0,-21.0 18.2,-10.5 18.2,10.5 0.0,21.0 -18.2,10.5 -18.2,-10.5"
            fill="#4285F4"
            fillOpacity={0.14}
            stroke="#4285F4"
            strokeWidth={2}
            strokeLinejoin="round"
            style={{ animationDelay: CELL_DELAYS[5] }}
          />
        </g>
        <g transform="translate(60.2 90.0)">
          <polygon
            className="hf-cell"
            points="0.0,-21.0 18.2,-10.5 18.2,10.5 0.0,21.0 -18.2,10.5 -18.2,-10.5"
            fill="#EA4335"
            fillOpacity={0.14}
            stroke="#EA4335"
            strokeWidth={2}
            strokeLinejoin="round"
            style={{ animationDelay: CELL_DELAYS[6] }}
          />
        </g>
      </g>
    </svg>
  );
}
