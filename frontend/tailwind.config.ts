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
        border: "#222222",
        muted: "#666666",
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Space Mono"', "monospace"],
      },
      keyframes: {
        pulse_glow: {
          "0%, 100%": { boxShadow: "0 0 8px #00ff88, 0 0 20px #00ff8833" },
          "50%": { boxShadow: "0 0 16px #00ff88, 0 0 40px #00ff8855" },
        },
      },
      animation: {
        pulse_glow: "pulse_glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
