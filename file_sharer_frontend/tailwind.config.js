/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/styles/**/*.{css}",         // ✅ include custom CSS folder if used
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
