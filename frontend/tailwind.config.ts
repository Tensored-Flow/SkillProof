import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        accent: "#00ff88",
        pink: "#ff0080",
        surface: "#111111",
        elevated: "#1a1a1a",
        border: "#222222",
        borderHover: "#333333",
        muted: "#666666",
        amber: {
          500: "#F59E0B",
        },
        cyan: {
          500: "#06B6D4",
        },
        purple: {
          500: "#A855F7",
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Space Mono"', "monospace"],
        display: ['"JetBrains Mono"', "monospace"],
        body: ['"IBM Plex Sans"', "sans-serif"],
      },
      keyframes: {
        pulse_glow: {
          "0%, 100%": { boxShadow: "0 0 8px #00ff88, 0 0 20px #00ff8833" },
          "50%": { boxShadow: "0 0 16px #00ff88, 0 0 40px #00ff8855" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        countUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulse_glow: "pulse_glow 2s ease-in-out infinite",
        fadeIn: "fadeIn 0.4s ease-out forwards",
        slideUp: "slideUp 0.4s ease-out forwards",
        countUp: "countUp 0.6s ease-out forwards",
      },
      boxShadow: {
        "glow-green": "0 0 20px rgba(0, 255, 136, 0.3)",
        "glow-pink": "0 0 20px rgba(255, 0, 128, 0.3)",
        "glow-amber": "0 0 20px rgba(245, 158, 11, 0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
