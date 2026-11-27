'use client';

import { asAppTheme, type AppTheme } from '@riad/shared';
import { useSyncExternalStore } from 'react';

/**
 * App colour themes. The CSS variables live in globals.css (`[data-theme=…]` on <html>);
 * these hex values are only for charts, which draw SVG attributes (no CSS variables there).
 * Keep both in step.
 */
export const THEME_COLORS: Record<AppTheme, { swatch: string; c900: string; c700: string; c500: string; c300: string }> = {
  teal: { swatch: '#3b793a', c900: '#3b793a', c700: '#4a8a49', c500: '#6fa56e', c300: '#a9cca8' },
  blue: { swatch: '#1d4fd7', c900: '#1d4fd7', c700: '#3864e0', c500: '#6e8fea', c300: '#a8bdf3' },
};

/** Remembered so the next visit paints in the right colours before signing in. */
export const THEME_STORAGE_KEY = 'riad.theme';

/** Runs before the page paints (root layout): no flash of the default colours. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t&&t!=='teal')document.documentElement.dataset.theme=t}catch(e){}`;

const listeners = new Set<() => void>();

function current(): AppTheme {
  return typeof document === 'undefined' ? 'teal' : asAppTheme(document.documentElement.dataset.theme);
}

/** Switches the whole app to `theme` (CSS variables + charts) and remembers it on this device. */
export function applyTheme(theme: AppTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'teal') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // private browsing: the riad setting still applies on the next load
  }
  setTabIcon(theme);
  listeners.forEach((l) => l());
}

/** The browser-tab icon follows the theme too (app/icon.png is the green one). */
function setTabIcon(theme: AppTheme): void {
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]');
  links.forEach((link) => {
    link.dataset.green ??= link.href;
    link.type = theme === 'blue' ? 'image/svg+xml' : 'image/png';
    link.href = theme === 'blue' ? '/brand/evoriad-mark-blue.svg' : link.dataset.green;
  });
}

/** Puts the theme remembered on this device back on <html> (it can be dropped by a re-render). */
export function reapplyStoredTheme(): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return;
  }
  if (stored && asAppTheme(stored) !== current()) applyTheme(asAppTheme(stored));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The active theme, re-rendering when it changes. */
export function useAppTheme(): AppTheme {
  return useSyncExternalStore(subscribe, current, () => 'teal');
}

/** Chart colours of the active theme. */
export function useThemeColors() {
  return THEME_COLORS[useAppTheme()];
}

/** Category colours: the theme ramp first, then warm accents so categories stay distinct. */
export function chartPalette(theme: AppTheme): string[] {
  const c = THEME_COLORS[theme];
  return [c.c900, c.c500, c.c300, '#c9a227', '#d97757', '#7c6f9b', c.c700, '#b5838d', '#a3a3a3'];
}

export function useChartPalette(): string[] {
  return chartPalette(useAppTheme());
}
