"use client";

import type { ReactNode } from "react";

import { HiveAppLogo } from "@/components/HiveWordmark";

import { hiveCaseFont } from "./hive-case-tokens";
import type { HiveCaseTab } from "./hive-case-tokens";

const CORE_TABS: { id: HiveCaseTab; label: string }[] = [
  { id: "story", label: "The story" },
  { id: "plan", label: "Your plan" },
  { id: "timeline", label: "Timeline" },
  { id: "meeting-prep", label: "Meeting prep" },
];

export function HiveCaseLayout({
  activeTab,
  onTabChange,
  onProView,
  documentTabs = [],
  children,
}: {
  activeTab: HiveCaseTab;
  onTabChange: (tab: HiveCaseTab) => void;
  onProView: () => void;
  documentTabs?: { id: HiveCaseTab; label: string }[];
  children: ReactNode;
}) {
  const tabs = [...CORE_TABS, ...documentTabs];
  return (
    <div
      style={{
        fontFamily: hiveCaseFont,
        color: "#202124",
        background: "#FFFFFF",
        fontSize: 16,
        lineHeight: 1.55,
        minHeight: "100vh",
      }}
    >
      <header style={{ borderBottom: "1px solid #EDEDED", background: "#FFFFFF" }}>
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            padding: "10px 32px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <HiveAppLogo linkHome display="lockup" className="py-0.5" />
          <nav
            aria-label="Case views"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              background: "#F8F9FA",
              border: "1px solid #EDEDED",
              borderRadius: 999,
              padding: 4,
              maxWidth: "min(100%, 720px)",
            }}
          >
            {tabs.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  data-testid={`hive-case-tab-${tab.id}`}
                  onClick={() => onTabChange(tab.id)}
                  style={{
                    minHeight: 40,
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0 16px",
                    borderRadius: 999,
                    background: active ? "#FFFFFF" : "transparent",
                    boxShadow: active ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                    color: active ? "#202124" : "#5F6368",
                    fontWeight: active ? 600 : 400,
                    fontSize: 14,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              data-testid="case-summary-view-pro"
              onClick={onProView}
              style={{
                minHeight: 40,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "0 14px",
                border: "1px solid #DADCE0",
                background: "#FFFFFF",
                color: "#202124",
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#202124"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 5h16M4 10h16M4 15h10M4 20h7" />
              </svg>
              Pro view
              <span
                style={{
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: "#FEF7E0",
                  border: "1px solid #F6D58A",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#8A5A00",
                }}
              >
                Free for now
              </span>
            </button>
            <button
              type="button"
              style={{
                minHeight: 40,
                padding: "0 16px",
                border: "1px solid #DADCE0",
                background: "#FFFFFF",
                color: "#202124",
                borderRadius: 999,
                fontFamily: "inherit",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Share
            </button>
          </div>
        </div>
      </header>
      <main
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "36px 32px 96px",
          display: "flex",
          flexDirection: "column",
          gap: 28,
        }}
      >
        {children}
      </main>
    </div>
  );
}
