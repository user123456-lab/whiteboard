/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          base: '#0A0A0B',
          elevated: '#131316',
          glass: 'rgba(18,18,22,0.88)',
        },
        accent: {
          DEFAULT: '#3B82F6',
          hover: '#60A5FA',
          muted: 'rgba(59,130,246,0.15)',
          glow: 'rgba(59,130,246,0.35)',
        },
      },
      backdropBlur: {
        glass: '16px',
      },
      zIndex: {
        canvas: '0',
        panel: '20',
        overlay: '30',
        modal: '40',
        'text-editor': '50',
      },
    },
  },
  plugins: [],
};
