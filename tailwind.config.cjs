/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#1A237E', // Design's primary color
          950: '#1e1b4b',
        },
        secondary: '#7C4DFF',
        accent: '#22C55E',
        surface: '#FFFFFF',
        background: '#F8FAFC',
        text: '#1F2937',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Be Vietnam Pro', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
