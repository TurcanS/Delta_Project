import { useState } from 'react';
import { useLang } from './i18n';

// The after-photo is laid over the before-photo and revealed from the left. In the grid the
// split is fixed at the middle; in the detail view a range input drives it (keyboard included).
export default function BeforeAfter({ before, after, interactive = false, alt }) {
  const { t } = useLang();
  const [position, setPosition] = useState(50);
  return (
    <div className={`before-after${interactive ? ' before-after--live' : ''}`} style={{ '--split': `${position}%` }}>
      <img src={before} alt={alt} loading="lazy" decoding="async" />
      <img className="before-after__after" src={after} alt="" loading="lazy" decoding="async" />
      <span className="before-after__rule" aria-hidden="true" />
      <span className="before-after__tag before-after__tag--before" aria-hidden="true">{t.before}</span>
      <span className="before-after__tag before-after__tag--after" aria-hidden="true">{t.after}</span>
      {interactive && <input type="range" min="0" max="100" value={position} onChange={(event) => setPosition(Number(event.target.value))} aria-label={t.compareLabel} aria-valuetext={`${t.before} ${position}%, ${t.after} ${100 - position}%`} />}
    </div>
  );
}
