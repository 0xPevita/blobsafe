/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
        display: ["'Syne'", "sans-serif"],
        body: ["'DM Sans'", "sans-serif"],
      },
      colors: {
        obsidian: {
          950: "#050508",
          900: "#0a0a0f",
          800: "#111118",
          700: "#1a1a24",
          600: "#24242f",
          500: "#2e2e3a",
        },
        acid: {
          DEFAULT: "#c6ff00",
          dim: "#a3d400",
          glow: "rgba(198,255,0,0.15)",
        },
        frost: {
          DEFAULT: "#e8e8f0",
          dim: "#9898aa",
          muted: "#55556a",
        },
        danger: "#ff4560",
        warning: "#ffb830",
        info: "#00d4ff",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-up": "fadeUp 0.5s ease forwards",
        "fade-in": "fadeIn 0.4s ease forwards",
        "slide-in": "slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        scan: "scan 3s linear infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: 0, transform: "translateY(12px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        slideIn: {
          "0%": { opacity: 0, transform: "translateX(-12px)" },
          "100%": { opacity: 1, transform: "translateX(0)" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(198,255,0,0.1)" },
          "50%": { boxShadow: "0 0 40px rgba(198,255,0,0.3)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(198,255,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(198,255,0,0.03) 1px, transparent 1px)",
        "noise": "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E\")",
      },
      backgroundSize: {
        "grid": "32px 32px",
      },
    },
  },
  plugins: [],
};
