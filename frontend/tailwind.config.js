/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(214 20% 88%)",
        background: "hsl(210 20% 98%)",
        foreground: "hsl(222 47% 11%)",
        muted: "hsl(210 20% 94%)",
        primary: "hsl(221 83% 40%)",
        "primary-foreground": "hsl(0 0% 100%)",
        destructive: "hsl(0 72% 51%)",
        card: "hsl(0 0% 100%)",
      },
    },
  },
  plugins: [],
};
