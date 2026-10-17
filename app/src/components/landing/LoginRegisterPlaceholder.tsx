"use client";

import { useState } from "react";

import { HiveAppLogo } from "@/components/HiveWordmark";

type AuthTab = "login" | "register";

type LoginRegisterPlaceholderProps = {
  onBack: () => void;
  onSessionAvailable: () => void;
  sessionRecheckBusy?: boolean;
  sessionContinueNotice?: string | null;
};

export function LoginRegisterPlaceholder({
  onBack,
  onSessionAvailable,
  sessionRecheckBusy = false,
  sessionContinueNotice = null,
}: LoginRegisterPlaceholderProps) {
  const [tab, setTab] = useState<AuthTab>("login");

  return (
    <section
      className="mx-auto flex w-full max-w-[440px] flex-col gap-5"
      data-testid="landing-auth-placeholder"
      aria-label="Sign in or create an account"
    >
      <div className="flex justify-center">
        <HiveAppLogo display="lockup" className="py-0.5" />
      </div>

      <div
        className="flex flex-col gap-5 rounded-[20px] border border-[#E7E9ED] bg-white px-9 py-9 shadow-[0_1px_2px_rgba(31,35,40,0.04),0_8px_28px_rgba(31,35,40,0.06)]"
        role="region"
        aria-labelledby="landing-auth-heading"
      >
        <div
          className="rounded-[10px] border border-[#EBDDB4] bg-[#FBF4E2] px-3.5 py-2.5 text-sm leading-snug text-[#3D3000]"
          data-testid="landing-auth-not-connected-notice"
        >
          Preview only — sign-in and registration are not connected yet. Your files and
          description stay on this device until you return to upload.
        </div>

        <div className="flex gap-1 rounded-full border border-[#E3E3E3] bg-[#F8F9FA] p-1">
          <button
            type="button"
            data-testid="landing-auth-tab-login"
            className={`flex-1 rounded-full px-3 py-2 text-sm font-medium ${
              tab === "login" ? "bg-white text-[#0D0D0D] shadow-sm" : "text-[#5F6368]"
            }`}
            aria-pressed={tab === "login"}
            onClick={() => setTab("login")}
          >
            Log in
          </button>
          <button
            type="button"
            data-testid="landing-auth-tab-register"
            className={`flex-1 rounded-full px-3 py-2 text-sm font-medium ${
              tab === "register" ? "bg-white text-[#0D0D0D] shadow-sm" : "text-[#5F6368]"
            }`}
            aria-pressed={tab === "register"}
            onClick={() => setTab("register")}
          >
            Create account
          </button>
        </div>

        {tab === "login" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 id="landing-auth-heading" className="m-0 text-[1.75rem] font-semibold tracking-tight">
                Welcome back
              </h2>
              <p className="m-0 text-sm text-[#5F6368]">Log in to your Hives.</p>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#0D0D0D]">
              Email
              <input
                type="email"
                autoComplete="username"
                data-testid="landing-auth-login-email"
                readOnly
                tabIndex={-1}
                aria-readonly="true"
                placeholder="you@example.com"
                className="h-[46px] cursor-not-allowed rounded-[10px] border border-[#D9DDE3] bg-[#F8F9FA] px-3.5 text-[15px] font-normal text-[#5F6368]"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#0D0D0D]">
              Password
              <input
                type="password"
                autoComplete="current-password"
                data-testid="landing-auth-login-password"
                readOnly
                tabIndex={-1}
                aria-readonly="true"
                placeholder="••••••••"
                className="h-[46px] cursor-not-allowed rounded-[10px] border border-[#D9DDE3] bg-[#F8F9FA] px-3.5 text-[15px] font-normal text-[#5F6368]"
              />
            </label>
            <button
              type="button"
              data-testid="landing-auth-login-submit"
              disabled
              aria-disabled="true"
              title="Sign-in is not connected in this preview"
              className="h-12 cursor-not-allowed rounded-[10px] border-0 bg-[#ECECEC] text-base font-semibold text-[#9AA0A6]"
            >
              Log in (not connected)
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 id="landing-auth-heading" className="m-0 text-[1.75rem] font-semibold tracking-tight">
                Create your account
              </h2>
              <p className="m-0 text-sm text-[#5F6368]">
                It takes a minute. You can add documents right after.
              </p>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#0D0D0D]">
              Your name
              <input
                type="text"
                data-testid="landing-auth-register-name"
                readOnly
                tabIndex={-1}
                aria-readonly="true"
                className="h-[46px] cursor-not-allowed rounded-[10px] border border-[#D9DDE3] bg-[#F8F9FA] px-3.5 text-[15px] font-normal text-[#5F6368]"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#0D0D0D]">
              Email
              <input
                type="email"
                data-testid="landing-auth-register-email"
                readOnly
                tabIndex={-1}
                aria-readonly="true"
                className="h-[46px] cursor-not-allowed rounded-[10px] border border-[#D9DDE3] bg-[#F8F9FA] px-3.5 text-[15px] font-normal text-[#5F6368]"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#0D0D0D]">
              Password
              <input
                type="password"
                data-testid="landing-auth-register-password"
                readOnly
                tabIndex={-1}
                aria-readonly="true"
                className="h-[46px] cursor-not-allowed rounded-[10px] border border-[#D9DDE3] bg-[#F8F9FA] px-3.5 text-[15px] font-normal text-[#5F6368]"
              />
            </label>
            <button
              type="button"
              data-testid="landing-auth-register-submit"
              disabled
              aria-disabled="true"
              title="Registration is not connected in this preview"
              className="h-12 cursor-not-allowed rounded-[10px] border-0 bg-[#ECECEC] text-base font-semibold text-[#9AA0A6]"
            >
              Create account (not connected)
            </button>
          </div>
        )}

        <button
          type="button"
          data-testid="landing-auth-session-continue"
          disabled={sessionRecheckBusy}
          aria-busy={sessionRecheckBusy}
          className="h-11 rounded-[10px] border border-[#0D0D0D] bg-white text-sm font-semibold text-[#0D0D0D] transition-colors hover:bg-[#F8F9FA] disabled:cursor-wait disabled:opacity-60"
          onClick={() => onSessionAvailable()}
        >
          {sessionRecheckBusy ? "Checking sign-in…" : "Continue with your account"}
        </button>
        <p className="m-0 text-center text-xs leading-snug text-[#5F6368]">
          Signed in elsewhere? We&apos;ll use your real Hive. Otherwise you&apos;ll continue in
          Preview Mode — no upload or reading until sign-in is connected.
        </p>

        {sessionContinueNotice ? (
          <p
            role="alert"
            data-testid="landing-auth-session-continue-notice"
            className="m-0 text-sm leading-snug text-[#3C4043]"
          >
            {sessionContinueNotice}
          </p>
        ) : null}

        <button
          type="button"
          data-testid="landing-auth-back"
          className="text-sm font-medium text-[#3C4043] underline-offset-2 hover:underline"
          onClick={onBack}
        >
          Back to upload
        </button>
      </div>
    </section>
  );
}
