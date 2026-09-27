import { useEffect, useRef, useState } from 'react';
import { Close, External } from './Icons';
import { useLang } from './i18n';
import { getDocument, libraryHost, queryPattern } from './library';

// The document's text with the searched words marked, and a way back to the original.
export default function DocumentReader({ item, query, onClose, onAsk }) {
  const { t } = useLang();
  const dialog = useRef(null);
  const [document, setDocument] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    getDocument(item.id, controller.signal).then(setDocument).catch((error) => { if (error.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, [item.id]);

  const pattern = queryPattern(query);
  const text = document?.text || '';
  const pieces = pattern ? text.split(pattern) : [text];
  const matches = pattern ? (text.match(pattern) || []).length : 0;

  return (
    <dialog ref={dialog} className="reader" aria-labelledby="reader-title" onClose={() => { if (!dialog.current.open) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) dialog.current.close(); }}>
      <header className="reader__head">
        {(item.image_url || item.cover_url) && <img className={`reader__cover reader__cover--${item.kind}`} src={item.kind === 'project' ? item.image_url : item.cover_url} alt="" />}
        <div className="reader__heading">
          <p className="reader__meta">{[t.libraryKind[item.kind], item.page_count && t.pages(item.page_count), libraryHost(item.url)].filter(Boolean).join(', ')}</p>
          <h2 id="reader-title">{item.title}</h2>
        </div>
        <button className="dialog-close" type="button" aria-label={t.close} onClick={() => dialog.current.close()}><Close /></button>
      </header>
      <div className="reader__actions">
        <a className="primary-action" href={item.url} target="_blank" rel="noreferrer">{t.openOriginal}<External /></a>
        <button className="ghost-action" type="button" onClick={() => { dialog.current.close(); onAsk(t.askAboutDocument(item.title)); }}>{t.askAssistant}</button>
        {matches > 0 && <span className="reader__count" role="status">{t.matchesInText(matches)}</span>}
      </div>
      {item.ocr && <p className="reader__note">{t.ocrNote}</p>}
      <div className="reader__sheet" lang="ro">
        {failed && <p>{t.errGeneric}</p>}
        {!failed && !document && <div className="skeleton skeleton--answer" aria-hidden="true" />}
        {document && !text && <p className="reader__empty">{t.noText}</p>}
        {document && text && <p className="reader__text">{pieces.map((piece, index) => (index % 2 === 1 ? <mark key={index}>{piece}</mark> : piece))}</p>}
      </div>
    </dialog>
  );
}
