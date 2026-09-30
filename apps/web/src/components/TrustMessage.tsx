import { ShieldCheck } from "lucide-react";

export function TrustMessage() {
  return (
    <div className="mt-8 flex items-center justify-center gap-2 font-sans text-xs text-hive-text-muted sm:text-sm">
      <ShieldCheck
        className="h-4 w-4 shrink-0 text-hive-blue"
        strokeWidth={2}
        aria-hidden
      />
      <span>
        Your documents remain private to you. They are only used to build your
        case understanding.
      </span>
    </div>
  );
}
