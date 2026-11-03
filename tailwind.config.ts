import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)', 3: 'var(--surface-3)' },
        ink: { DEFAULT: 'var(--ink)', soft: 'var(--ink-soft)' },
        muted: 'var(--muted)',
        line: { DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
        accent: { DEFAULT: 'var(--accent)', ink: 'var(--accent-ink)', soft: 'var(--accent-soft)', on: 'var(--on-accent)' },
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
        urgent: { DEFAULT: 'var(--urgent)', soft: 'var(--urgent-soft)' },
        medium: { DEFAULT: 'var(--medium)', soft: 'var(--medium-soft)' },
        low: { DEFAULT: 'var(--low)', soft: 'var(--low-soft)' },
      },
      fontFamily: { sans: 'var(--font-sans)' },
      boxShadow: { soft: 'var(--shadow)', ring: 'var(--ring)' },
    },
  },
  plugins: [],
} satisfies Config;