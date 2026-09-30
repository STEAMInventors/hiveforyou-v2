import type { Config } from "tailwindcss";



const config: Config = {

  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],

  theme: {

    extend: {

      colors: {

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

        18: "4.5rem",

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

