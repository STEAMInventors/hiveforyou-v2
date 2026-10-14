"use client";

import { useState, type ReactNode } from "react";

import { signInWithGoogle } from "@/lib/auth/google-sign-in";

const DEFAULT_CLASS =
  "rounded-full bg-[#0D0D0D] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60";

export function GoogleSignInButton({
  className = DEFAULT_CLASS,
  children = "Sign in with Google",
  nextPath = "/",
}: {
  className?: string;
  children?: ReactNode;
  nextPath?: string;
}) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <span className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        className={className}
        aria-label="Sign in with Google"
        data-testid="google-sign-in"
        disabled={pending}
        onClick={() => {
          setFailed(false);
          setPending(true);
          void signInWithGoogle(nextPath).catch(() => {
            setPending(false);
            setFailed(true);
          });
        }}
      >
        {pending ? "Redirecting to Google…" : children}
      </button>
      {failed ? <span role="alert">Google sign-in could not start. Try again.</span> : null}
    </span>
  );
}
