/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        blue: {
          50: 'rgb(var(--color-primary-50) / <alpha-value>)',
          100: 'rgb(var(--color-primary-100) / <alpha-value>)',
          200: 'rgb(var(--color-primary-200) / <alpha-value>)',
          300: 'rgb(var(--color-primary-300) / <alpha-value>)',
          400: 'rgb(var(--color-primary-400) / <alpha-value>)',
          500: 'rgb(var(--color-primary-500) / <alpha-value>)',
          600: 'rgb(var(--color-primary-600) / <alpha-value>)',
          700: 'rgb(var(--color-primary-700) / <alpha-value>)',
          800: 'rgb(var(--color-primary-800) / <alpha-value>)',
          900: 'rgb(var(--color-primary-900) / <alpha-value>)',
          950: 'rgb(var(--color-primary-950) / <alpha-value>)',
        },
        secondary: '#7C4DFF',
        accent: '#22C55E',
        surface: {
          DEFAULT: 'var(--surface-2, #121B2B)',
          canvas: 'var(--surface-canvas, #080D17)',
          1: 'var(--surface-1, #0D1422)',
          2: 'var(--surface-2, #121B2B)',
          3: 'var(--surface-3, #182338)',
          4: 'var(--surface-4, #202D45)',
          input: 'var(--surface-input, #0B1220)',
          hover: 'var(--surface-hover, #172238)',
          selected: 'var(--surface-selected, #1B2B47)',
          disabled: 'var(--surface-disabled, #111927)',
        },
        background: 'var(--surface-canvas, #080D17)',
        text: {
          DEFAULT: 'var(--text-body, #D7DEE9)',
          primary: 'var(--text-primary, #F4F7FB)',
          body: 'var(--text-body, #D7DEE9)',
          secondary: 'var(--text-secondary, #B5C0D0)',
          tertiary: 'var(--text-tertiary, #8794A8)',
          disabled: 'var(--text-disabled, #5D687A)',
          inverse: 'var(--text-inverse, #08101F)',
        },
        border: {
          DEFAULT: 'var(--border-default, #293954)',
          subtle: 'var(--border-subtle, #223149)',
          default: 'var(--border-default, #293954)',
          strong: 'var(--border-strong, #2E405E)',
          focus: 'var(--border-focus, #78A6FF)',
        },
        apex: {
          primary: 'var(--primary, #2F67E8)',
          'primary-hover': 'var(--primary-hover, #3568DC)',
          'primary-active': 'var(--primary-active, #2453BD)',
          success: 'var(--success, #35D39A)',
          warning: 'var(--warning, #F7B955)',
          danger: 'var(--danger, #FF667A)',
          info: 'var(--info, #62A5FF)',
          decor: 'var(--decor, #B084FF)',
        },
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', '"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
      },

      animation: {
        'blob': 'blob 7s infinite',
        'aurora': 'aurora 15s linear infinite',
        'breathing': 'breathing 3s ease-in-out infinite',
        'glow': 'glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        blob: {
          '0%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
          '100%': { transform: 'translate(0px, 0px) scale(1)' },
        },
        aurora: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        breathing: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1', boxShadow: '0 0 15px rgba(255,255,255,0.1)' },
          '50%': { transform: 'scale(1.02)', opacity: '0.85', boxShadow: '0 0 25px rgba(255,255,255,0.2)' },
        },
        glow: {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%': { opacity: '0.6', filter: 'brightness(1.5)' },
        }
      },
    },
  },
  plugins: [],
}
