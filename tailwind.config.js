/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EEF4FF',
          100: '#D1E3FF',
          200: '#A3C7FF',
          300: '#75ABFF',
          500: '#1A6FFF',
          600: '#1A6FFF',
          700: '#1259D4',
          900: '#0A3270',
          DEFAULT: '#1A6FFF',
        },
        ink: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          700: '#334155',
          900: '#0F172A',
        },
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};
