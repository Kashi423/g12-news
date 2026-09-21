import type { Config } from "tailwindcss";

// Palette sampled from the G12 News logo (G12 logo.jpg): blue ~#03388E, red ~#BE0303,
// neutral background ~#EEEEEE. Light theme only — there is no dark mode.
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1rem", sm: "1.5rem", lg: "2rem" },
      screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1200px" },
    },
    extend: {
      colors: {
        // Primary brand: the logo's blue.
        brand: {
          DEFAULT: "#03388E",
          50: "#EEF4FD",
          100: "#DCE8FA",
          200: "#B9D0F5",
          300: "#8AB0EE",
          400: "#4F86E6",
          500: "#1765DF",
          600: "#0A4DB4",
          700: "#03388E",
          800: "#022E77",
          900: "#022769",
          950: "#01163D",
        },
        // The logo's red. Use it sparingly (wordmark, thin rules, key accents) so it stays impactful.
        crimson: {
          DEFAULT: "#BE0303",
          50: "#FDEDED",
          100: "#FBD5D5",
          200: "#F7AAAA",
          300: "#F07777",
          400: "#E75554",
          500: "#DE3837",
          600: "#BE0303",
          700: "#9C0303",
          800: "#810304",
          900: "#5E0203",
        },
        // Breaking-news elements (banners, labels, live badges): the logo red.
        breaking: {
          DEFAULT: "#BE0303",
          deep: "#9C0303", // hover / pressed
        },
        // Neutrals.
        canvas: "#FFFFFF", // page background
        surface: "#F3F4F6", // cards, footer, subtle panels
        ink: "#1F2328", // body text (dark charcoal)
        muted: "#5B6470", // secondary text
        line: "#DDE1E7", // borders and dividers
      },
      keyframes: {
        // The ticker track holds its content twice; sliding by half a track is one seamless loop.
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        "breaking-in": { from: { opacity: "0", transform: "translateY(-8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        marquee: "marquee var(--marquee-duration, 40s) linear infinite",
        "breaking-in": "breaking-in 450ms ease-out both",
      },
      fontFamily: {
        // Headlines: serif display. Body/UI: sans. Variables are set by next/font in layout.tsx.
        serif: ["var(--font-serif)", "Georgia", "Cambria", "Times New Roman", "serif"],
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
