/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#10211b",
        honey: "#e8a83e",
        cream: "#f7f4ec",
        moss: "#527464"
      },
      boxShadow: { soft: "0 18px 60px rgba(16, 33, 27, .10)" }
    }
  },
  plugins: []
};
