import { createContext, useContext, useEffect, useState } from 'react';

/**
 * @typedef {Object} ThemeContextValue
 * @property {'light' | 'dark'} theme
 * @property {() => void} toggleTheme
 */

const ThemeContext = createContext(/** @type {ThemeContextValue | null} */ (null));

/**
 * Provides light/dark theme state to the whole app and keeps it in sync with
 * the `dark` class on the root <html> element so Tailwind's `dark:` variants work.
 * Falls back to the user's OS preference on first load.
 */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    const stored = window.localStorage.getItem('tms-theme');
    if (stored) return stored;
    // Dark is this workspace's primary look; only start in light mode if the
    // OS explicitly prefers it AND doesn't also prefer dark (covers systems
    // with no preference set either way).
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem('tms-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
