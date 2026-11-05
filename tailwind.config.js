/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./index.{js,jsx,ts,tsx}",
    "./src/app/**/*.{js,jsx,ts,tsx}",         // <-- FIX: Targets the app router inside src
    "./src/components/**/*.{js,jsx,ts,tsx}",  // Targets any components in src
    "./src/**/*.{js,jsx,ts,tsx}",             // Broad fallback for anything else inside src
  ],
   darkMode: 'class', 
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
};
