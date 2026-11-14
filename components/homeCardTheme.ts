import type { CardAccentColor, CardSurfaceStyle } from '@/lib/types';

// ==========================================
// TEMA DE LAS CARDS DEL INICIO
// ==========================================
export interface AccentTheme {
  tile: string;
  glow: string;
  soft: string;
  border: string;
  text: string;
  onSwatch: string;
}

export const ACCENT_THEMES: Record<CardAccentColor, AccentTheme> = {
  accent: {
    tile: 'bg-accent text-accent-on',
    glow: 'bg-accent-soft',
    soft: 'bg-accent-soft',
    border: 'border-accent/50',
    text: 'text-accent-ink',
    onSwatch: 'text-accent-on',
  },
  high: {
    tile: 'bg-high text-surface',
    glow: 'bg-high-soft',
    soft: 'bg-high-soft',
    border: 'border-high/50',
    text: 'text-high',
    onSwatch: 'text-surface',
  },
  medium: {
    tile: 'bg-medium text-surface',
    glow: 'bg-medium-soft',
    soft: 'bg-medium-soft',
    border: 'border-medium/50',
    text: 'text-medium',
    onSwatch: 'text-surface',
  },
  low: {
    tile: 'bg-low text-surface',
    glow: 'bg-low-soft',
    soft: 'bg-low-soft',
    border: 'border-low/50',
    text: 'text-low',
    onSwatch: 'text-surface',
  },
  urgent: {
    tile: 'bg-urgent text-surface',
    glow: 'bg-urgent-soft',
    soft: 'bg-urgent-soft',
    border: 'border-urgent/50',
    text: 'text-urgent',
    onSwatch: 'text-surface',
  },
  neutral: {
    tile: 'bg-surface-3 text-ink-soft',
    glow: 'bg-surface-3',
    soft: 'bg-surface-2',
    border: 'border-line-strong',
    text: 'text-ink-soft',
    onSwatch: 'text-ink-soft',
  },
};

export const SURFACE_THEMES: Record<CardSurfaceStyle, string> = {
  default: 'border border-line bg-surface shadow-soft',
  bordered: 'border-2 bg-surface shadow-soft',
  tinted: 'border border-line shadow-soft',
  minimal: 'border border-line/60 bg-transparent',
};

export function accentSurfaceClass(surface: CardSurfaceStyle, accent: AccentTheme): string {
  if (surface === 'bordered') return accent.border;
  if (surface === 'tinted') return accent.soft;
  return '';
}

export const ACCENT_HOVER_BORDER: Record<CardAccentColor, string> = {
  accent: 'hover:border-accent/40',
  high: 'hover:border-high/40',
  medium: 'hover:border-medium/40',
  low: 'hover:border-low/40',
  urgent: 'hover:border-urgent/40',
  neutral: 'hover:border-line-strong',
};

/** Clases del contenedor de los módulos según la densidad elegida. */
export const LAYOUT_GRID: Record<'cards-lg' | 'cards-sm' | 'list', string> = {
  'cards-lg': 'grid grid-cols-1 gap-7 md:grid-cols-2 md:gap-8',
  'cards-sm': 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3',
  list: 'flex flex-col gap-3.5',
};