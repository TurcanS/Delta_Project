import { useEffect, useRef } from 'react';
import { segment } from './api';
import { useLang } from './i18n';
import { Close, External, DocumentIcon } from './Icons';

const kindOf = (mark) => (mark.focus ? 'focus' : mark.matches?.includes('answer_evidence') ? 'evidence' : 'term');

// "9 300 000 MDL" arrives as four marks; show one continuous highlight instead.
function mergeAdjacent(text, marks) {
  const chars = Array.from(text || '');
  const merged = [];
  for (const mark of [...marks].sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && kindOf(last) === kindOf(mark) && mark.start >= last.end && /^[\s.,:]*$/.test(chars.slice(last.end, mark.start).join('')) && !/\n/.test(chars.slice(last.end, mark.start).join(''))) {
      last.end = mark.end;
    } else merged.push({ ...mark });
  }
  return merged;
}

export default function SourceViewer({ citation, index, range, open, onClose, answerLanguage }) {
  const { t } = useLang();
  const focus = useRef(null);
  const heading = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // On small screens the viewer is a sheet over the answer: focus moves into it and comes back on close.
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const onKey = (event) => { if (event.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    if (window.matchMedia('(max-width: 1000px)').matches) heading.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    focus.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [citation?.chunk_id, range?.start]);

  if (!citation) {
    return <aside className="viewer viewer--empty" id="source-viewer" aria-label={t.source}><DocumentIcon /><p>{t.viewerEmpty}</p></aside>;
  }

  // Evidence highlights come from the API; the focused range is the phrase the reader clicked.
  const marks = (citation.highlights || []).filter((h) => !range || h.end <= range.start || h.start >= range.end);
  if (range) marks.push({ ...range, focus: true });
  const parts = segment(citation.text, mergeAdjacent(citation.text, marks));
  const meta = [
    citation.section && !/^Auto chunk/i.test(citation.section) && `${t.section}: ${citation.section}`,
    citation.page != null && `${t.page} ${citation.page}`,
    citation.publication_date && `${t.published}: ${citation.publication_date}`,
    citation.effective_date && `${t.effective}: ${citation.effective_date}`,
  ].filter(Boolean);

  return (
    <aside className={`viewer${open ? ' viewer--open' : ''}`} id="source-viewer" aria-labelledby="viewer-title">
      <header className="viewer__head">
        <span className="viewer__index">{t.source} {index + 1}</span>
        <button className="viewer__close" type="button" onClick={onClose} aria-label={t.closeSource}><Close /></button>
      </header>
      <p className="sr-only" role="status">{t.sourceShown(index + 1, citation.title || '')}</p>
      <h2 id="viewer-title" ref={heading} tabIndex={-1} lang={citation.language}>{citation.title}</h2>
      {meta.length > 0 && <p className="viewer__meta">{meta.join(', ')}</p>}
      <a className="viewer__link" href={citation.url} target="_blank" rel="noreferrer">{t.openDocument}<External /></a>
      <div className="viewer__sheet">
        <p className="viewer__label">{t.passage}{answerLanguage && citation.language && citation.language !== answerLanguage && `, ${t.originalLanguage(t.languageName[citation.language] || citation.language)}`}</p>
        <div className="viewer__text" key={`${citation.chunk_id}-${range?.start ?? ''}`} lang={citation.language}>
          {parts.map((part, i) => {
            if (!part.range) return <span key={i}>{part.text}</span>;
            const evidence = part.range.focus || part.range.matches?.includes('answer_evidence');
            return <mark key={i} ref={part.range.focus ? focus : undefined} className={part.range.focus ? 'is-focus' : evidence ? 'is-evidence' : 'is-term'}>{part.text}</mark>;
          })}
        </div>
      </div>
    </aside>
  );
}
