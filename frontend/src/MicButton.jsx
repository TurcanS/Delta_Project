import { canDictate, useDictation } from './speech';
import { useLang } from './i18n';

export default function MicButton({ onText, className = '' }) {
  const { lang, t } = useLang();
  const { listening, toggle } = useDictation(lang, onText);
  if (!canDictate) return null;
  return (
    <>
      <button className={`mic-button${listening ? ' is-listening' : ''} ${className}`} type="button" onClick={toggle}
        aria-pressed={listening} aria-label={listening ? t.stopDictation : t.dictate} title={listening ? t.stopDictation : t.dictate}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
      </button>
      <span className="sr-only" role="status">{listening ? t.listening : ''}</span>
    </>
  );
}
