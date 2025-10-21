/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],

  theme: {
    extend: {
      fontFamily: {
        sans: ["Montserrat", "system-ui", "sans-serif"],
      },
      fontSize: {
        body: ["16px", { lineHeight: "1.6" }],
        h1: ["clamp(24px,4vw,36px)", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        h2: ["clamp(20px,3vw,24px)", { lineHeight: "1.2", letterSpacing: "-0.005em" }],
        h3: ["clamp(18px,2.5vw,20px)", { lineHeight: "1.25" }],
        h4: ["clamp(16px,2vw,18px)", { lineHeight: "1.3" }],
      },
      screens: {
        xs: "480px",
      },
      colors: {
      primary: "#17E1B1", // основной цвет
      secondary: "#385AD8",
      lowWhite: "rgba(255, 255, 255, 0.05)"
    },
    },
  },
};
