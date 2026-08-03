import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          canvas: 'hsl(var(--surface-canvas))',
          DEFAULT: 'hsl(var(--surface))',
          elevated: 'hsl(var(--surface-elevated))',
          input: 'hsl(var(--surface-input))',
        },
        ink: {
          DEFAULT: 'hsl(var(--ink))',
          secondary: 'hsl(var(--ink-secondary))',
          tertiary: 'hsl(var(--ink-tertiary))',
          muted: 'hsl(var(--ink-muted))',
        },
        edge: {
          DEFAULT: 'hsl(var(--edge))',
          soft: 'hsl(var(--edge-soft))',
          emphasis: 'hsl(var(--edge-emphasis))',
        },
        brand: {
          DEFAULT: '#059669',
          light: '#10b981',
          dark: '#047857',
        },
        success: '#16a34a',
        warning: '#d97706',
        danger: '#dc2626',
        info: '#0284c7',
      },
    },
  },
  plugins: [],
};

export default config;
