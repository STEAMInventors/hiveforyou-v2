import { HiveAppLogo } from "@/components/HiveWordmark";

export function HiveCustomerWordmark() {
  return (
    <HiveAppLogo
      linkHome
      display="responsive"
      className="rounded-lg px-1.5 py-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-customerHive-primary/40"
    />
  );
}
