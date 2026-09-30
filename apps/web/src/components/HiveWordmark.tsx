type HiveWordmarkProps = {
  className?: string;
  size?: "header" | "footer";
};

export function HiveWordmark({ className = "", size = "header" }: HiveWordmarkProps) {
  const textClass =
    size === "header"
      ? "font-serif text-2xl font-bold tracking-tight text-hive-navy"
      : "font-serif text-xs font-bold text-hive-navy";

  return (
    <span className={`${textClass} ${className}`.trim()}>
      Hive<span className="font-normal text-hive-sage">ForYou</span>
    </span>
  );
}

export function HiveBrandMark({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-lg bg-hive-navy text-white shadow-hive ${className}`.trim()}
      aria-hidden
    >
      <span className="font-serif text-lg font-bold text-hive-sage">H</span>
    </div>
  );
}
