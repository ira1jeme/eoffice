/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#EEF2F6',
          100: '#D6E0EA',
          400: '#3D6690',
          600: '#264A6E',
          700: '#1B3A5C',
          900: '#0F2438',
        },
        slate2: {
          500: '#5B6B82',
          600: '#44546B',
        },
        amber: {
          500: '#C98A2C',
          50: '#FBF1E1',
        },
        success: {
          500: '#2F7A4D',
          50: '#E8F3EC',
        },
        danger: {
          500: '#B3413B',
          50: '#F8E9E8',
        },
        bg: '#F4F6F8',
        border2: '#D8DEE6',
      },
      fontFamily: {
        display: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
