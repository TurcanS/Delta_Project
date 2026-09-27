import { useCallback, useEffect, useRef, useState } from 'react';
import { Close, External, ThumbDown, ThumbUp } from './Icons';
import { useAuth } from './auth';
import { useLang } from './i18n';
import { approval, getDeck, getResults, sendVote } from './swipe';

const THRESHOLD = 110;      // px of travel that counts as a decision
const FLICK = 0.6;          // px/ms: a quick flick decides even when short
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const shortDate = (iso, lang) => new Date(`${iso}T12:00:00`).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'ro-RO', { month: 'long', year: 'numeric' });

function ProjectCard({ card, sectors, style, stamp, handlers, depth }) {
  const { lang, t } = useLang();
  const sector = sectors.find((item) => item.id === card.sector);
  return (
    <article className={`swipe-card${depth === 0 ? ' is-top' : ''}`} style={style} aria-hidden={depth > 0} {...handlers}>
      <div className="swipe-card__photo">
        <img src={card.image_url} alt="" draggable="false" />
        {depth === 0 && <>
          <span className="swipe-stamp swipe-stamp--like" style={{ opacity: Math.max(0, stamp) }}>{t.swipeLike}</span>
          <span className="swipe-stamp swipe-stamp--dislike" style={{ opacity: Math.max(0, -stamp) }}>{t.swipeDislike}</span>
        </>}
      </div>
      <div className="swipe-card__body">
        <p className="swipe-card__meta">{[sector?.label, card.published_on && shortDate(card.published_on, lang)].filter(Boolean).join(', ')}</p>
        <h3 className="swipe-card__title">{card.title}</h3>
        <p className="swipe-card__category">{card.category}</p>
        {card.investment && <p className="swipe-card__money">{t.investmentLabel}: {card.investment}</p>}
        {depth === 0 && <a className="swipe-card__link" href={card.url} target="_blank" rel="noreferrer" onPointerDown={(event) => event.stopPropagation()}>{t.openOriginal}<External /></a>}
      </div>
    </article>
  );
}

function Ranking({ sectors, onBack }) {
  const { t } = useLang();
  const { user } = useAuth();
  const [sector, setSector] = useState('');
  const [data, setData] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    getResults(sector, controller.signal).then(setData).catch(() => setData({ items: [], votes: 0, voters: 0, mine: {} }));
    return () => controller.abort();
  }, [sector]);
  return (
    <div className="swipe-ranking">
      <div className="swipe-ranking__head">
        <div>
          <h2 id="swipe-title">{t.rankingTitle}</h2>
          <p>{data ? t.rankingIntro(data.votes, data.voters) : ''}</p>
        </div>
        <select value={sector} onChange={(event) => setSector(event.target.value)} aria-label={t.sectorFilter}>
          <option value="">{t.allCity}</option>
          {sectors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>
      {data && data.items.length === 0 && <p className="swipe-ranking__empty">{t.rankingEmpty}</p>}
      <ol className="swipe-ranking__list">
        {data?.items.map((item) => {
          const percent = approval(item.likes, item.dislikes);
          const mine = data.mine[String(item.id)];
          return (
            <li key={item.id}>
              <img src={item.image_url} alt="" loading="lazy" />
              <div>
                <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
                <p>{[sectors.find((entry) => entry.id === item.sector)?.label, t.votesCount(item.votes), mine && t.yourVote(mine === 'like')].filter(Boolean).join(', ')}</p>
                <span className="approval" aria-label={t.approval(percent)}><span style={{ width: `${percent}%` }} /></span>
              </div>
              <strong>{percent}%</strong>
            </li>
          );
        })}
      </ol>
      <div className="swipe-ranking__actions">
        <button className="solid-action" type="button" onClick={onBack}>{t.backToGame}</button>
        {user?.role === 'employee' && <a className="ghost-action" href="/api/swipe/results.csv">{t.downloadCsv}</a>}
      </div>
    </div>
  );
}

export default function SwipeGame({ sectors, onClose }) {
  const { t } = useLang();
  const dialog = useRef(null);
  const [cards, setCards] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [index, setIndex] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(null);
  const [verdict, setVerdict] = useState(null);
  const [liked, setLiked] = useState(0);
  const [voted, setVoted] = useState(0);
  const [view, setView] = useState('game');
  const drag = useRef(null);
  // A decision made while the previous card is still flying off is applied to the next card.
  const queued = useRef(null);
  const decideRef = useRef(null);

  const loadDeck = useCallback(() => {
    setCards(null);
    getDeck().then((data) => { setCards(data.cards); setRemaining(data.remaining); setIndex(0); setVerdict(null); }).catch(() => setCards([]));
  }, []);

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    loadDeck();
    return () => element.close();
  }, [loadDeck]);

  const current = cards?.[index];

  const decide = useCallback((value) => {
    if (leaving) { queued.current = value; return; }
    if (!current) return;
    const direction = value === 'skip' ? 0 : value === 'like' ? 1 : -1;
    setLeaving(value);
    setDragging(false);
    setOffset(value === 'skip' ? { x: 0, y: -window.innerHeight } : { x: direction * window.innerWidth, y: offset.y * 2 });
    if (value !== 'skip') {
      if (value === 'like') setLiked((count) => count + 1);
      setVoted((count) => count + 1);
      sendVote(current.id, value)
        .then((result) => setVerdict({ value, title: current.title, likes: result.likes, dislikes: result.dislikes }))
        .catch(() => setVerdict({ value, title: current.title, failed: true }));
    }
    window.setTimeout(() => {
      setLeaving(null);
      setOffset({ x: 0, y: 0 });
      setIndex((position) => position + 1);
      const next = queued.current;
      queued.current = null;
      if (next) window.setTimeout(() => decideRef.current(next), 30);
    }, reducedMotion() ? 0 : 280);
  }, [current, leaving, offset.y]);
  decideRef.current = decide;

  useEffect(() => {
    if (view !== 'game') return undefined;
    const onKey = (event) => {
      if (event.target.closest?.('select, input, textarea')) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); decide('like'); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); decide('dislike'); }
      if (event.key === 'ArrowUp') { event.preventDefault(); decide('skip'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, view]);

  const handlers = {
    onPointerDown: (event) => {
      if (leaving || event.button > 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, y: event.clientY, samples: [{ x: event.clientX, t: performance.now() }] };
      setDragging(true);
    },
    onPointerMove: (event) => {
      if (!drag.current) return;
      const samples = [...drag.current.samples, { x: event.clientX, t: performance.now() }].filter((sample) => performance.now() - sample.t < 120);
      drag.current.samples = samples;
      setOffset({ x: event.clientX - drag.current.x, y: (event.clientY - drag.current.y) * 0.4 });
    },
    onPointerUp: () => {
      if (!drag.current) return;
      const { samples } = drag.current;
      const velocity = samples.length > 1 ? (samples.at(-1).x - samples[0].x) / Math.max(1, samples.at(-1).t - samples[0].t) : 0;
      drag.current = null;
      if (offset.x > THRESHOLD || velocity > FLICK) decide('like');
      else if (offset.x < -THRESHOLD || velocity < -FLICK) decide('dislike');
      else { setDragging(false); setOffset({ x: 0, y: 0 }); }
    },
    onPointerCancel: () => { drag.current = null; setDragging(false); setOffset({ x: 0, y: 0 }); },
  };

  const progress = Math.min(1, Math.abs(offset.x) / THRESHOLD);
  const stack = cards ? cards.slice(index, index + 3) : [];
  const done = cards && index >= cards.length;
  const percent = verdict && !verdict.failed ? approval(verdict.likes, verdict.dislikes) : null;
  const agreeing = verdict && !verdict.failed ? (verdict.value === 'like' ? verdict.likes : verdict.dislikes) : 0;

  return (
    <dialog ref={dialog} className="swipe-game" aria-labelledby="swipe-title" onClose={() => { if (!dialog.current.open) onClose(); }}>
      <button className="dialog-close" type="button" aria-label={t.close} onClick={() => dialog.current.close()}><Close /></button>
      {view === 'ranking' ? <Ranking sectors={sectors} onBack={() => { setView('game'); if (done) loadDeck(); }} /> : <>
        <header className="swipe-game__head">
          <h2 id="swipe-title">{t.swipeTitle}</h2>
          <p>{t.swipeIntro}</p>
        </header>

        <div className="swipe-deck" aria-live="polite">
          {!cards && <div className="swipe-card swipe-card--loading" aria-hidden="true" />}
          {cards && cards.length === 0 && <div className="swipe-empty"><h3>{t.swipeAllVoted}</h3><button className="solid-action" type="button" onClick={() => setView('ranking')}>{t.seeRanking}</button></div>}
          {done && cards.length > 0 && (
            <div className="swipe-empty">
              <h3>{voted ? t.swipeDoneTitle(voted) : t.swipeNoneVoted}</h3>
              {voted > 0 && <p>{t.swipeDoneBody(liked)}</p>}
              <div>
                {remaining > cards.length && <button className="solid-action" type="button" onClick={loadDeck}>{t.swipeMore}</button>}
                <button className="ghost-action" type="button" onClick={() => setView('ranking')}>{t.seeRanking}</button>
              </div>
            </div>
          )}
          {stack.map((card, depth) => {
            const top = depth === 0;
            const lift = top ? 0 : depth - progress;
            const style = top
              ? { transform: `translate(${offset.x}px, ${offset.y}px) rotate(${offset.x / 18}deg)`, transition: dragging ? 'none' : leaving && reducedMotion() ? 'none' : 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)', zIndex: 3 }
              : { transform: `translateY(${lift * 12}px) scale(${1 - lift * 0.05})`, transition: dragging ? 'none' : 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)', zIndex: 3 - depth };
            return <ProjectCard key={card.id} card={card} sectors={sectors} depth={depth} style={style} stamp={top ? offset.x / THRESHOLD : 0} handlers={top ? handlers : {}} />;
          }).reverse()}
        </div>

        <p className="swipe-verdict" role="status">
          {verdict && (verdict.failed ? t.swipeVoteFailed : percent !== null && verdict.likes + verdict.dislikes > 1
            ? t.swipeVerdict(agreeing - 1, verdict.likes + verdict.dislikes - 1, verdict.value === 'like')
            : t.swipeFirst)}
        </p>

        {current && (
          <div className="swipe-controls">
            <button className="swipe-button swipe-button--dislike" type="button" onClick={() => decide('dislike')} aria-label={t.swipeDislike}><ThumbDown /></button>
            <button className="swipe-skip" type="button" onClick={() => decide('skip')}>{t.swipeSkip}</button>
            <button className="swipe-button swipe-button--like" type="button" onClick={() => decide('like')} aria-label={t.swipeLike}><ThumbUp /></button>
          </div>
        )}
        {cards && cards.length > 0 && !done && (
          <p className="swipe-foot">
            <span>{t.swipeProgress(Math.min(index + 1, cards.length), cards.length)}</span>
            <span className="swipe-foot__hint">{t.swipeKeys}</span>
            <button type="button" className="text-action" onClick={() => setView('ranking')}>{t.seeRanking}</button>
          </p>
        )}
      </>}
    </dialog>
  );
}
