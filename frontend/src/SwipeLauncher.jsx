import { useLang } from './i18n';

// The small launcher that stays in the corner of every page.
export function SwipeLauncher({ onOpen }) {
  const { t } = useLang();
  return (
    <button className="swipe-launcher" type="button" onClick={onOpen} aria-label={t.swipeOpen}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="7" y="3.5" width="12" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.6" transform="rotate(8 13 11.5)" /><rect x="4.5" y="5" width="12" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.6" fill="var(--launcher-bg)" /><path d="M8 14.5c1.2 1 2.4 1.5 3.5 1.5s2.3-.5 3-1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      <span className="swipe-launcher__label">{t.swipeOpen}</span>
    </button>
  );
}
