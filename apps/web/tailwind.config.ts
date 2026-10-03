import type { Config } from "tailwindcss";



const config: Config = {

  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],

  theme: {

    extend: {

      colors: {

        hz: {

          background: "#ffffff",

          "on-background": "#000000",

          primary: "#FF5E3A",

          "on-primary": "#ffffff",

          "primary-container": "#ff8a65",

          "on-primary-container": "#752305",

          secondary: "#556500",

          "secondary-container": "#d6ed7a",

          "on-secondary-container": "#5a6c00",

          tertiary: "#326578",

          "tertiary-container": "#80b1c7",

          surface: "#ffffff",

          "surface-variant": "#f4f4f4",

          "surface-container-low": "#f9f3e8",

          "surface-container-lowest": "#ffffff",

          "on-surface": "#000000",

          "on-surface-variant": "#555555",

          outline: "#89726b",

          "outline-variant": "#ddc0b8",

        },

        hive: {

          navy: "var(--hive-color-navy)",

          "navy-muted": "var(--hive-color-navy-muted)",

          sage: "var(--hive-color-sage)",

          "sage-muted": "var(--hive-color-sage-muted)",

          blue: "var(--hive-color-blue)",

          "blue-muted": "var(--hive-color-blue-muted)",

          "soft-sky": "var(--hive-color-soft-sky)",

          "upload-icon-bg": "var(--hive-color-upload-icon-bg)",

          page: "var(--hive-color-page)",

          surface: "var(--hive-color-surface)",

          border: "var(--hive-color-border)",

          "border-strong": "var(--hive-color-border-strong)",

          text: "var(--hive-color-text)",

          "text-muted": "var(--hive-color-text-muted)",

          "text-inverse": "var(--hive-color-text-inverse)",

          error: "var(--hive-color-error)",

        },

      },

      fontFamily: {

        hz: ["var(--font-outfit)", "Segoe UI", "sans-serif"],
        brand: ["var(--font-outfit)", "Segoe UI", "sans-serif"],

        serif: ["var(--font-source-serif)", "Georgia", "serif"],

        sans: ["var(--font-dm-sans)", "Segoe UI", "sans-serif"],

        mono: ["var(--font-jetbrains-mono)", "monospace"],

      },

      borderRadius: {

        hive: "var(--hive-radius-md)",

        "hive-lg": "var(--hive-radius-lg)",

        "hive-xl": "var(--hive-radius-xl)",

        "hive-2xl": "1rem",

      },

      boxShadow: {

        hive: "var(--hive-shadow-sm)",

        "hive-md": "var(--hive-shadow-md)",

        "hive-lg": "var(--hive-shadow-lg)",

        "hive-focus": "var(--hive-shadow-focus)",

      },

      spacing: {

        "hive-section": "var(--hive-space-section)",

        "hz-container": "4rem",

        "hz-section": "7.5rem",

        "hz-card": "2.5rem",

        18: "4.5rem",

      },

      fontSize: {

        "hz-display": ["4rem", { lineHeight: "1.1", letterSpacing: "-0.04em", fontWeight: "800" }],

        "hz-headline-lg": ["2.5rem", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],

        "hz-headline-md": ["1.5rem", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" }],

        "hz-body-lg": ["1.125rem", { lineHeight: "1.6", fontWeight: "400" }],

        "hz-label-caps": ["0.75rem", { lineHeight: "1", letterSpacing: "0.1em", fontWeight: "700" }],

      },

      maxWidth: {

        hive: "var(--hive-max-content)",

        "hive-upload": "var(--hive-max-upload)",

      },

      keyframes: {

        "doc-float": {

          "0%, 100%": {

            transform: "translateY(0) rotate(var(--doc-rotate, 0deg))",

          },

          "50%": {

            transform: "translateY(-4px) rotate(var(--doc-rotate, 0deg))",

          },

        },

        "doc-float-delay-1": {

          "0%, 100%": {

            transform: "translateY(0) rotate(var(--doc-rotate, 0deg))",

          },

          "50%": {

            transform: "translateY(-4px) rotate(var(--doc-rotate, 0deg))",

          },

        },

        "doc-float-delay-2": {

          "0%, 100%": {

            transform: "translateY(0) rotate(var(--doc-rotate, 0deg))",

          },

          "50%": {

            transform: "translateY(-4px) rotate(var(--doc-rotate, 0deg))",

          },

        },

        "hive-hex-pulse": {

          "0%, 100%": { transform: "scale(1)", opacity: "0.92" },

          "50%": { transform: "scale(1.04)", opacity: "1" },

        },

        "hive-hex-inner": {

          "0%, 100%": { transform: "rotate(0deg)" },

          "50%": { transform: "rotate(6deg)" },

        },

      },

      animation: {

        "doc-float": "doc-float 6s ease-in-out infinite",

        "doc-float-delay-1": "doc-float-delay-1 7s ease-in-out infinite 1s",

        "doc-float-delay-2": "doc-float-delay-2 8s ease-in-out infinite 2s",

        "hive-hex-pulse": "hive-hex-pulse 3.5s ease-in-out infinite",

        "hive-hex-inner": "hive-hex-inner 5s ease-in-out infinite",

      },

    },

  },

  plugins: [],

};



export default config;

