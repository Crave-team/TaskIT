/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Manrope"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      colors: {
        surface: {
          light: '#E9E2D0',
          card: '#F5F0E3',
          dark: '#0A0C0F',
          darkcard: '#15181D',
        },
        brand: {
          50: '#E7FBF3',
          100: '#C6F5E2',
          300: '#6FE3BB',
          500: '#22C990',
          600: '#16A87A',
          700: '#0F8863',
          900: '#0A4A38',
        },
        coral: { 500: '#E8604C', 600: '#D34A36' },
        amber: { 500: '#D9A441', 600: '#BC8A2C' },
        sage: { 500: '#4E8D7C', 600: '#3D7566' },
        ink: {
          900: '#1A1D24',
          700: '#3D414B',
          500: '#6B7280',
          300: '#A0A6B1',
        },
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(26, 29, 36, 0.06), 0 1px 1px rgba(26,29,36,0.04)',
        elevated: '0 8px 24px rgba(26, 29, 36, 0.10)',
      },
      fontSize: {
        'fluid-xs': 'clamp(0.72rem, 0.7rem + 0.1vw, 0.78rem)',
        'fluid-sm': 'clamp(0.82rem, 0.8rem + 0.15vw, 0.9rem)',
        'fluid-base': 'clamp(0.95rem, 0.9rem + 0.2vw, 1rem)',
        'fluid-lg': 'clamp(1.05rem, 1rem + 0.3vw, 1.2rem)',
        'fluid-xl': 'clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem)',
        'fluid-2xl': 'clamp(1.55rem, 1.4rem + 0.8vw, 2rem)',
        'fluid-3xl': 'clamp(1.9rem, 1.7rem + 1.2vw, 2.6rem)',
      },
      transitionTimingFunction: {
        springy: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        popIn: {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        floaty: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        tourPulse: {
          '0%': { boxShadow: '0 0 0 0 rgba(34, 201, 144, 0.65), 0 0 18px 2px rgba(34, 201, 144, 0.45)' },
          '70%': { boxShadow: '0 0 0 14px rgba(34, 201, 144, 0), 0 0 18px 2px rgba(34, 201, 144, 0.45)' },
          '100%': { boxShadow: '0 0 0 0 rgba(34, 201, 144, 0), 0 0 18px 2px rgba(34, 201, 144, 0.45)' },
        },
        progressFill: { from: { width: '0%' }, to: { width: '100%' } },
      },
      animation: {
        floaty: 'floaty 6s ease-in-out infinite',
        'floaty-slow': 'floaty 8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
