export function ProViewIcon({ id }: { id: "brief" | "side" | "trends" | "ledger" | "export" }) {
  const props = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#1B1F24",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (id) {
    case "brief":
      return (
        <svg {...props}>
          <path d="M5 4h14v16H5z" />
          <path d="M8 9h8M8 13h8M8 17h5" />
        </svg>
      );
    case "side":
      return (
        <svg {...props}>
          <rect x="3" y="4" width="8" height="16" rx="1.5" />
          <rect x="13" y="4" width="8" height="16" rx="1.5" />
        </svg>
      );
    case "trends":
      return (
        <svg {...props}>
          <path d="M3 19h18" />
          <path d="M5 15l5-5 4 3 6-7" />
        </svg>
      );
    case "ledger":
      return (
        <svg {...props}>
          <path d="M4 5h16M4 10h16M4 15h16M4 20h10" />
        </svg>
      );
    case "export":
      return (
        <svg {...props}>
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
      );
  }
}

export function ProRankMark({ rank }: { rank: number }) {
  return (
    <span className="rank" aria-label={`Rank ${rank}`}>
      <svg viewBox="0 0 40 44" width="40" height="44" aria-hidden>
        <path
          d="M20 2 37.3 12v20L20 42 2.7 32V12z"
          fill={rank === 1 ? "#F2B53A" : "#fff"}
          stroke="#1B1F24"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      <span>{rank}</span>
    </span>
  );
}
