import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#13231d",
        cream: "#f5f3ec",
        moss: "#3f6f5d",
        lime: "#d9f26f",
      },
      boxShadow: {
        soft: "0 20px 60px rgba(28, 57, 46, 0.10)",
      },
    },
  },
  plugins: [],
} satisfies Config;
