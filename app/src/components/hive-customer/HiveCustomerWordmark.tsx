import Link from "next/link";

export function HiveCustomerWordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex select-none items-center gap-2">
      <svg
        className="shrink-0"
        fill="none"
        height="26"
        viewBox="0 0 40 40"
        width="26"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path d="M20 3L26 6.5V13.5L20 17L14 13.5V6.5L20 3Z" fill="#3B7CF6" />
        <path d="M31 11L37 14.5V21.5L31 25L25 21.5V14.5L31 11Z" fill="#EF5143" />
        <path d="M20 20L26 23.5V30.5L20 34L14 30.5V23.5L20 20Z" fill="#F6B826" />
        <path d="M9 11L15 14.5V21.5L9 25L3 21.5V14.5L9 11Z" fill="#2FA35A" />
      </svg>
      <span className="font-brand text-[20px] leading-none tracking-tight text-customerHive-on-surface">
        <span className="font-semibold">Hive</span>
        <span className="font-normal">ForYou</span>
      </span>
    </Link>
  );
}
