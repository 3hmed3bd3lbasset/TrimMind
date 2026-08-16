/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        serif: ['Fraunces', 'Reem Kufi', 'Georgia', 'serif'],
        sans: ['Tajawal', 'Manrope', 'Cairo', 'system-ui', 'sans-serif'],
        cairo: ['Tajawal', 'Cairo', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        paper: {
          DEFAULT: '#f3eee4',
          warm: '#eae2d1',
          deep: '#dfd5bf',
          pure: '#ffffff',
        },
        ink: {
          DEFAULT: '#181613',
          soft: '#3a342d',
          mute: '#6e665b',
          faint: '#9e968b',
        },
        forest: {
          DEFAULT: '#1e3a2e',
          soft: '#2d5141',
          deep: '#132720',
          dark: '#0e1d16',
        },
        sage: {
          DEFAULT: '#859680',
          soft: '#a3b19f',
        },
        terra: {
          DEFAULT: '#c2613d',
          deep: '#9b4527',
          soft: '#e3a98f',
          light: '#f5ded4',
        },
        border: {
          DEFAULT: '#d6ccb7',
          soft: '#e2d8c4',
          dark: '#b8ac94',
        },
      },
      boxShadow: {
        'clinic-1': '0 1px 2px rgba(24, 22, 19, 0.04), 0 2px 8px rgba(24, 22, 19, 0.04)',
        'clinic-2': '0 4px 14px rgba(24, 22, 19, 0.06), 0 10px 30px rgba(24, 22, 19, 0.06)',
        'clinic-3': '0 12px 32px rgba(24, 22, 19, 0.08), 0 28px 64px rgba(24, 22, 19, 0.1)',
        'clinic-cta': '0 5px 0 #132720, 0 14px 22px -8px rgba(18, 35, 24, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        'clinic-cta-hover': '0 7px 0 #132720, 0 20px 30px -10px rgba(18, 35, 24, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
        'terra-cta': '0 5px 0 #7a3219, 0 14px 22px -8px rgba(194, 97, 61, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
      },
      borderRadius: {
        'clinic-sm': '10px',
        'clinic': '18px',
        'clinic-lg': '28px',
      },
    },
  },
  plugins: [],
};
