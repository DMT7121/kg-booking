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
          50: '#fef9ec',
          100: '#fcefc9',
          200: '#f9dc8e',
          300: '#f5c453',
          400: '#f2b02b',
          500: '#ec9413',
          600: '#d1700d',
          700: '#ad500f',
          800: '#8d3f13',
          900: '#743413',
        },
      },
      fontFamily: {
        sans: ['Be Vietnam Pro', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
