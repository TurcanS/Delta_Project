import { useEffect, useRef, useState } from 'react';
import DocumentReader from './DocumentReader';
import { DocSearch, External } from './Icons';
import { useAuth } from './auth';
import { useLang } from './i18n';
import { useToast } from './Toast';
import { LIBRARY_KINDS, libraryHost, libraryStats, refreshLibrary, searchLibrary, splitSnippet } from './library';
import { Completion } from './LibraryParts';

const shortDate = (iso, lang) => new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });

function Snippet({ text }) {
  return <p className="library-item__snippet">{splitSnippet(text).map((part, index) => (part.mark ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>))}</p>;
}

// Month heading for the newest-first list: "Septembrie 2026".
function monthOf(iso, lang) {
  if (!iso) return null;
  const label = new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'ro-RO', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function groupByMonth(items, lang, undated) {
  const groups = [];
  for (const item of items) {
    const label = monthOf(item.published_on, lang) || undated;
    if (groups.at(-1)?.label === label) groups.at(-1).items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

// A card per project or document: its photo or first page, then what it is and when.
function DocCard({ item, sectors, featured, onRead, onAsk }) {
  const { lang, t } = useLang();
  const sector = sectors.find((entry) => entry.id === item.sector);
  const cover = item.kind === 'project' ? item.image_url : item.cover_url;
  const meta = item.kind === 'project'
    ? [t.libraryKind.project, sector?.label]
    : [item.kind.toUpperCase(), item.page_count && t.pages(item.page_count), libraryHost(item.url)];
  return (
    <li className={`doc-card doc-card--${item.kind}${featured ? ' doc-card--featured' : ''}`}>
      <div className={`doc-card__cover${cover ? '' : ' is-blank'}`}>
        {cover
          ? <img src={cover} alt="" loading="lazy" decoding="async" />
          : <span className="doc-card__paper" aria-hidden="true"><span>{item.kind.toUpperCase()}</span>{item.title}</span>}
      </div>
      <div className="doc-card__body">
        <p className="doc-card__meta">
          <span>{meta.filter(Boolean).join(', ')}</span>
          {item.published_on && <time dateTime={item.published_on} title={item.kind === 'project' ? t.addedOnPortal : t.documentDate}>{shortDate(item.published_on, lang)}</time>}
        </p>
        <h3 className="doc-card__title"><button type="button" onClick={() => onRead(item)}>{item.title}</button></h3>
        {item.snippet
          ? <Snippet text={item.snippet} />
          : <p className="doc-card__summary">{item.kind === 'project' ? item.category : item.summary?.slice(0, 180)}</p>}
        <div className="doc-card__facts">
          {item.investment && <span>{item.investment}</span>}
          <Completion value={item.progress} />
          {item.ocr && <span className="library-item__ocr">{t.ocrShort}</span>}
        </div>
        <div className="doc-card__actions">
          <a href={item.url} target="_blank" rel="noreferrer">{t.openOriginal}<External /></a>
          <button type="button" onClick={() => onAsk(t.askAboutDocument(item.title))}>{t.askAssistant}</button>
        </div>
      </div>
    </li>
  );
}

export default function Library({ sectors, params, onAsk, onVote }) {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const notify = useToast();
  const [query, setQuery] = useState(params.get('q') || '');
  const [kind, setKind] = useState(LIBRARY_KINDS.includes(params.get('kind')) ? params.get('kind') : '');
  const [sector, setSector] = useState(params.get('sector') || '');
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);
  const [reading, setReading] = useState(null);
  const [stats, setStats] = useState(null);
  const debounced = useRef(null);
  const [search, setSearch] = useState(query);
  const [sort, setSort] = useState('new');

  useEffect(() => { libraryStats().then(setStats).catch(() => {}); }, []);
  useEffect(() => {
    clearTimeout(debounced.current);
    debounced.current = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(debounced.current);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    searchLibrary({ q: search, kind, sector, sort: search ? sort : '' }, controller.signal).then(setData).catch((error) => { if (error.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, [search, kind, sector, sort]);

  async function loadMore() {
    setMore(true);
    try {
      const page = await searchLibrary({ q: search, kind, sector, sort: search ? sort : '', offset: data.items.length });
      setData((current) => ({ ...page, items: [...current.items, ...page.items.filter((item) => !current.items.some((row) => row.id === item.id))] }));
    } catch { notify(t.errGeneric, 'error'); } finally { setMore(false); }
  }

  async function refresh() {
    try {
      const result = await refreshLibrary();
      notify(result.status === 'running' ? t.libraryRefreshRunning : t.libraryRefreshStarted);
    } catch { notify(t.errGeneric, 'error'); }
  }

  const counts = data?.counts || { project: 0, pdf: 0, docx: 0 };
  const total = counts.project + counts.pdf + counts.docx;

  return (
    <div className="library page">
      <header className="library__head">
        <div>
          <h1 className="issues__title">{t.libraryTitle}</h1>
          <p className="issues__intro">{t.libraryIntro}</p>
        </div>
        <button className="ghost-action" type="button" onClick={onVote}>{t.swipeOpen}</button>
      </header>

      <form className="library__search" role="search" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); }}>
        <DocSearch className="askbar__spark" />
        <label className="sr-only" htmlFor="library-query">{t.librarySearchLabel}</label>
        <input id="library-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.librarySearchPlaceholder} autoComplete="off" maxLength={200} />
      </form>

      <div className="issues__filters library__filters">
        <p className="tally" role="group" aria-label={t.libraryFilterLabel}>
          <button type="button" aria-pressed={kind === ''} onClick={() => setKind('')}>{search ? t.libraryResults(total) : t.libraryHolds(total)}</button>:{' '}
          {LIBRARY_KINDS.filter((value) => counts[value] > 0 || kind === value).map((value, index, shown) => (
            <span key={value}>
              {index > 0 && index === shown.length - 1 ? ` ${t.tally.and} ` : index > 0 ? ', ' : ''}
              <button type="button" className={`tally__kind-${value}`} aria-pressed={kind === value} onClick={() => setKind(kind === value ? '' : value)}>{t.libraryCount[value](counts[value])}</button>
            </span>
          ))}.
        </p>
        <div className="issues__selects">
          {search && (
            <div className="sort-switch" role="group" aria-label={t.sortLabel}>
              {['new', 'relevance'].map((value) => <button key={value} type="button" aria-pressed={sort === value} onClick={() => setSort(value)}>{value === 'new' ? t.sortNewest : t.sortRelevant}</button>)}
            </div>
          )}
          <label><span className="sr-only">{t.sectorFilter}</span>
            <select value={sector} onChange={(event) => setSector(event.target.value)}>
              <option value="">{t.allCity}</option>
              {sectors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {failed ? (
        <div className="issues__state"><h2>{t.issuesLoadFailed}</h2><p>{t.loadFailedBody}</p></div>
      ) : !data ? (
        <div className="skeleton-list" aria-hidden="true">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skeleton--card" />)}</div>
      ) : data.items.length === 0 ? (
        <div className="issues__state"><h2>{search ? t.libraryNoMatches : t.libraryEmpty}</h2><p>{search ? t.libraryNoMatchesBody : t.libraryEmptyBody}</p></div>
      ) : (
        <div className="library-feed" aria-live="polite">
          {(search && sort === 'relevance' ? [{ label: null, items: data.items }] : groupByMonth(data.items, lang, t.undated)).map((group, groupIndex) => (
            <section key={`${group.label}-${groupIndex}`} className="library-month" aria-label={group.label || t.sortRelevant}>
              {group.label && <h2 className="library-month__title">{group.label}</h2>}
              <ul className="doc-grid">
                {group.items.map((item, index) => <DocCard key={item.id} item={item} sectors={sectors} featured={!search && groupIndex === 0 && index === 0} onRead={setReading} onAsk={onAsk} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
      {data?.has_more && <div className="issues__more"><button className="ghost-action" type="button" onClick={loadMore} disabled={more}>{t.issuesMore}</button></div>}

      <p className="library__updated">
        {stats?.updated_at && t.libraryUpdated(shortDate(stats.updated_at, lang))}
        {user?.role === 'employee' && <button type="button" className="text-action" onClick={refresh}>{t.libraryRefresh}</button>}
      </p>
      {reading && <DocumentReader item={reading} query={search} onClose={() => setReading(null)} onAsk={onAsk} />}
    </div>
  );
}
