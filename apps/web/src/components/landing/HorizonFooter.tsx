import Link from "next/link";

import { HiveBrandMark } from "@/components/HiveWordmark";

export function HorizonFooter() {
  return (
    <footer className="relative z-20 -mt-20 w-full bg-transparent py-8 font-hz text-base text-hz-secondary">
      <div className="mx-auto flex max-w-[1515px] flex-col items-center justify-between gap-8 px-hz-container md:flex-row">
        <Link
          href="/"
          className="flex items-center gap-2 opacity-80 transition-opacity hover:opacity-100"
        >
          <HiveBrandMark variant="footer" className="grayscale opacity-70" />
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-6">
          <Link href="#privacy" className="text-white opacity-80 transition-opacity hover:opacity-100">
            Privacy Policy
          </Link>
          <Link href="#terms" className="text-white opacity-80 transition-opacity hover:opacity-100">
            Terms of Service
          </Link>
          <Link href="#contact" className="text-white opacity-80 transition-opacity hover:opacity-100">
            Contact
          </Link>
        </div>
        <div className="text-sm text-white/70">© {new Date().getFullYear()} HiveForYou</div>
      </div>
    </footer>
  );
}
