import { useCallback, useEffect, useState } from 'react';

// index.html sets data-theme before the first paint; this hook keeps it in sync afterwards.
const current = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
const stored = () => { try { return localStorage.getItem('theme'); } catch { return null; } };

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#060d20' : '#e3efff');
}

export function useTheme() {
  const [theme, setTheme] = useState(current);

  // Until the visitor picks a theme, follow the operating system.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event) => {
      if (stored()) return;
      const next = event.matches ? 'dark' : 'light';
      apply(next);
      setTheme(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    const next = current() === 'dark' ? 'light' : 'dark';
    const swap = () => { apply(next); setTheme(next); };
    try { localStorage.setItem('theme', next); } catch { /* storage unavailable */ }
    if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.documentElement.classList.add('theme-swap');
      const transition = document.startViewTransition(swap);
      transition.finished.finally(() => document.documentElement.classList.remove('theme-swap'));
    } else swap();
  }, []);

  return [theme, toggle];
}
