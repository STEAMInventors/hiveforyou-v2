"use client";

import { useSearchParams } from "next/navigation";

import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export function AuthCallbackNotice() {
  const params = useSearchParams();
  if (params.get("auth") !== "error") {
    return null;
  }

  return (
    <div className="flex w-full max-w-[720px] flex-col items-center gap-3 text-center" role="alert">
      <p className="m-0 text-sm text-[#3C4043]">Google sign-in did not complete. Try again.</p>
      <GoogleSignInButton />
    </div>
  );
}
