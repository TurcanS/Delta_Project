import { useEffect, useState } from 'react';
import { speak, stopSpeaking, useVoice } from './speech';
import { useToast } from './Toast';
import { segment, sendFeedback } from './api';
import { contactsFor, host, PRIMARIA, topicLinks } from './contactRouting';
import { useLang } from './i18n';
import { Check, Question, Split, ThumbUp, ThumbDown, External } from './Icons';
import { searchLibrary } from './library';

const EXCERPT = 110; // characters of context on each side of the evidence

function conflictText(conflict) {
  if (!conflict) return '';
  if (typeof conflict === 'string') return conflict;
  return conflict.message || conflict.summary || conflict.description || conflict.reason || '';
}

// Splits highlighted answer parts into lines, keeping each part's grounding.
function toLines(parts) {
  const lines = [[]];
  for (const part of parts) {
    part.text.split('\n').forEach((piece, index) => {
      if (index > 0) lines.push([]);
      if (piece) lines.at(-1).push({ ...part, text: piece });
    });
  }
  return lines.filter((line) => line.some((part) => part.text.trim()));
}

const LIST_ITEM = /^\s*(?:(\d+)[.)]|[-•–*])\s+/;
function stripMarker(line) {
  const match = line[0]?.text.match(LIST_ITEM);
  if (!match) return { line, number: null, bullet: false };
  return { line: [{ ...line[0], text: line[0].text.slice(match[0].length) }, ...line.slice(1)].filter((part) => part.text), number: match[1] || null, bullet: !match[1] };
}

// Consecutive "1. …" lines become a checklist of steps; "- …" lines a plain list; the rest paragraphs.
function toBlocks(lines) {
  const blocks = [];
  for (const raw of lines) {
    const { line, number, bullet } = stripMarker(raw);
    const kind = number ? 'steps' : bullet ? 'list' : 'text';
    const last = blocks.at(-1);
    if (kind !== 'text' && last?.kind === kind) last.items.push(line);
    else blocks.push({ kind, items: [line] });
  }
  return blocks;
}

// The evidence sentence of a passage, with a little context, for the source list.
function excerptOf(citation) {
  const chars = Array.from(citation.text || '');
  const evidence = (citation.highlights || []).filter((h) => h.matches?.includes('answer_evidence')).sort((a, b) => a.start - b.start);
  if (!evidence.length) return { before: chars.slice(0, EXCERPT * 2).join(''), mark: '', after: '', cut: [false, chars.length > EXCERPT * 2] };
  const start = evidence[0].start;
  const end = Math.max(...evidence.filter((h) => h.start - start < EXCERPT).map((h) => h.end));
  const from = Math.max(0, start - EXCERPT);
  const to = Math.min(chars.length, end + EXCERPT);
  const snap = (text, side) => (side === 'start' ? text.replace(/^\S*\s/, '') : text.replace(/\s\S*$/, ''));
  return {
    before: from > 0 ? snap(chars.slice(from, start).join(''), 'start') : chars.slice(0, start).join(''),
    mark: chars.slice(start, end).join(''),
    after: to < chars.length ? snap(chars.slice(end, to).join(''), 'end') : chars.slice(end).join(''),
    cut: [from > 0, to < chars.length],
  };
}

export default function AnswerCard({ turn, sectors, selectedChunk, onSelect }) {
  const { t } = useLang();
  const { data } = turn;
  const citations = data.citations || [];
  const conflict = data.conflict || data.status === 'conflict';
  const kind = conflict ? 'conflict' : data.status === 'answered' ? 'answered' : 'abstained';
  const documents = new Set(citations.map((citation) => citation.document_id)).size;
  const parts = kind === 'abstained' ? [{ text: data.answer }] : segment(data.answer, data.answer_highlights);
  const found = contactsFor(`${turn.question} ${data.answer}`, sectors);
  // A clear answer only points onward when there is somewhere concrete to go; the sector
  // question is for answers that could not settle the matter.
  const routing = kind === 'answered' ? { ...found, needsSector: false, topics: found.topics.filter((topic) => !topic.bySector || found.sectors.length) } : found;
  const showContacts = kind !== 'answered' || routing.sectors.length > 0 || routing.aboutPetitions || routing.topics.length > 0;
  const shown = kind === 'abstained' ? [] : citations;
  const sourceNumber = (chunkId) => shown.findIndex((citation) => citation.chunk_id === chunkId) + 1;
  const otherLanguages = [...new Set(shown.map((citation) => citation.language).filter((language) => language && language !== turn.language))];

  const status = {
    answered: [<Check key="i" />, t.statusAnswered(documents)],
    abstained: [<Question key="i" />, t.statusAbstained],
    conflict: [<Split key="i" />, t.statusConflict],
  }[kind];

  const renderPart = (part, i) => {
    const source = part.range?.sources?.[0];
    if (!source) return <span key={i}>{part.text}</span>;
    const number = sourceNumber(source.chunk_id);
    return (
      <button key={i} type="button" className={`grounded${part.range.sources.some((s) => s.chunk_id === selectedChunk) ? ' is-active' : ''}`}
        aria-controls="source-viewer" onClick={() => onSelect(source.chunk_id, source)}>
        {part.text}{number > 0 && <><sup className="grounded__ref" aria-hidden="true">{number}</sup><span className="sr-only">, {t.showSource(number)}</span></>}
      </button>
    );
  };

  return (
    <div className={`answer answer--${kind}`}>
      <p className="answer__status">{status[0]}<span>{status[1]}</span>
        {data.elapsed_ms != null && <span className="answer__time">{t.seconds(data.elapsed_ms)}</span>}
      </p>
      <AnswerBody blocks={toBlocks(toLines(parts))} language={turn.language} renderPart={renderPart} turnId={turn.id} />
      {kind === 'abstained' && <p className="answer__help">{t.abstainedHelp}</p>}
      {kind === 'abstained' && <LibraryHints question={turn.question} />}
      {kind === 'conflict' && <div className="answer__conflict" role="note"><p>{conflictText(data.conflict) || t.conflictHelp}</p>{conflictText(data.conflict) && <p>{t.conflictHelp}</p>}</div>}
      {otherLanguages.length > 0 && <p className="answer__translated">{t.translatedNote(otherLanguages.map((code) => t.languageName[code] || code).join(', '))}</p>}

      {shown.length > 0 && <section className="evidence" aria-label={t.sources}>
        <h3>{t.sources}</h3>
        <ol>
          {shown.map((citation, i) => {
            const excerpt = excerptOf(citation);
            const meta = [citation.section && !/^Auto chunk/i.test(citation.section) && citation.section, citation.page != null && `${t.page} ${citation.page}`, citation.publication_date].filter(Boolean);
            return (
              <li key={citation.chunk_id} className={selectedChunk === citation.chunk_id ? 'is-active' : ''}>
                <span className="evidence__index" aria-hidden="true">{i + 1}</span>
                <div className="evidence__body">
                  <p className="evidence__title" lang={citation.language}>{citation.title || host(citation.url)}</p>
                  <p className="evidence__meta">{host(citation.url)}{meta.length ? `, ${meta.join(', ')}` : ''}</p>
                  <blockquote className="evidence__quote" lang={citation.language}>
                    {excerpt.cut[0] && '… '}{excerpt.before}{excerpt.mark && <mark>{excerpt.mark}</mark>}{excerpt.after}{excerpt.cut[1] && ' …'}
                  </blockquote>
                  <div className="evidence__actions">
                    <button type="button" aria-pressed={selectedChunk === citation.chunk_id} aria-controls="source-viewer" onClick={() => onSelect(citation.chunk_id, null)}>{t.showPassage(i + 1)}</button>
                    {citation.url && <a href={citation.url} target="_blank" rel="noreferrer">{t.openDocument}<External /></a>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>}

      {data.next_steps.length > 0 && <div className="next-steps">
        <h3>{t.nextSteps}</h3>
        <ul>{data.next_steps.map((step, i) => {
          const label = typeof step === 'string' ? step : step.label || step.title || step.text;
          const url = typeof step === 'object' ? step.url : null;
          const number = typeof step === 'object' && step.chunk_id ? sourceNumber(step.chunk_id) : 0;
          return <li key={i}>{url ? <a href={url} target="_blank" rel="noreferrer">{label}<External /></a> : label}
            {number > 0 && <button type="button" className="step-source" onClick={() => onSelect(step.chunk_id, null)} aria-label={t.showSource(number)}>{number}</button>}</li>;
        })}</ul>
      </div>}

      {showContacts && <ContactRouting routing={routing} sectors={sectors} />}
      <footer className="answer__footer">
        <AnswerTools turn={turn} citations={shown} />
        <Feedback turn={turn} citations={shown} />
      </footer>
    </div>
  );
}

// Procedures come back as numbered lines; citizens can tick off the steps they have done.
function AnswerBody({ blocks, language, renderPart, turnId }) {
  const { t } = useLang();
  const [done, setDone] = useState(() => new Set());
  const toggle = (key) => setDone((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  return (
    <div className="answer__text" lang={language}>
      {blocks.map((block, b) => {
        if (block.kind === 'text') return <p key={b}>{block.items[0].map(renderPart)}</p>;
        if (block.kind === 'list') return <ul key={b} className="answer__list">{block.items.map((line, i) => <li key={i}>{line.map(renderPart)}</li>)}</ul>;
        return (
          <ol key={b} className="answer__steps" aria-label={t.stepsLabel}>
            {block.items.map((line, i) => {
              const key = `${b}-${i}`;
              const id = `step-${turnId}-${key}`;
              return (
                <li key={key} className={done.has(key) ? 'is-done' : ''}>
                  <input type="checkbox" id={id} checked={done.has(key)} onChange={() => toggle(key)} aria-labelledby={`${id}-text`} />
                  <span className="answer__step-number" aria-hidden="true">{i + 1}</span>
                  <span id={`${id}-text`}>{line.map(renderPart)}</span>
                </li>
              );
            })}
          </ol>
        );
      })}
    </div>
  );
}

// When the documents behind the assistant have no answer, the library may still hold a page
// that mentions the subject: offered as a lead, not as an answer.
function LibraryHints({ question }) {
  const { t } = useLang();
  const [items, setItems] = useState([]);
  useEffect(() => {
    const controller = new AbortController();
    searchLibrary({ q: question, limit: 3, match: 'any' }, controller.signal).then((data) => setItems(data.items)).catch(() => {});
    return () => controller.abort();
  }, [question]);
  if (!items.length) return null;
  return (
    <div className="library-hints">
      <h3>{t.libraryHintsTitle}</h3>
      <ul>{items.map((item) => <li key={item.id}><a href={item.url} target="_blank" rel="noreferrer">{item.title}<External /></a><span>{t.libraryKind[item.kind]}</span></li>)}</ul>
      <a className="text-action" href={`#/documente?q=${encodeURIComponent(question)}`}>{t.libraryHintsAll}</a>
    </div>
  );
}

function AnswerTools({ turn, citations }) {
  const { t } = useLang();
  const notify = useToast();
  const language = turn.language || 'ro';
  const canSpeak = useVoice(language);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => { if (speaking) stopSpeaking(); }, [speaking]);

  function toggleSpeech() {
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    setSpeaking(true);
    speak(turn.data.answer, language, () => setSpeaking(false));
  }

  async function copy() {
    const sources = citations.map((citation, i) => `${i + 1}. ${citation.title || host(citation.url)}: ${citation.url}`);
    const text = [turn.question, '', turn.data.answer, ...(sources.length ? ['', `${t.sources}:`, ...sources] : [])].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notify(t.copied);
    } catch { notify(t.errGeneric, 'error'); }
  }

  return (
    <div className="answer__tools">
      {canSpeak && <button type="button" className={`tool-button${speaking ? ' is-active' : ''}`} onClick={toggleSpeech} aria-pressed={speaking}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d={speaking ? 'M16 9v6M19 9v6' : 'M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        {speaking ? t.stopListen : t.listen}
      </button>}
      <button type="button" className="tool-button" onClick={copy}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M5 15V6a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        {t.copyAnswer}
      </button>
    </div>
  );
}

function ContactRouting({ routing, sectors }) {
  const { t } = useLang();
  const [chosen, setChosen] = useState(null);
  const sector = routing.sectors[0] || sectors.find((item) => item.id === chosen) || null;
  const praetors = routing.sectors.length ? routing.sectors : sector && (routing.aboutPetitions || routing.topics.some((topic) => topic.bySector)) ? [sector] : [];
  return (
    <div className="contact-route">
      <h3>{t.contactTitle}</h3>
      {routing.needsSector && (
        <fieldset className="contact-route__sector">
          <legend>{t.contactWhichSector}</legend>
          <div>{sectors.map((item) => <button key={item.id} type="button" aria-pressed={chosen === item.id} onClick={() => setChosen(item.id)}>{item.label}</button>)}</div>
        </fieldset>
      )}
      <ul>
        {routing.topics.map((topic) => {
          const links = topicLinks(topic, sector);
          if (!links.length) return null;
          return (
            <li key={topic.id}>
              <strong>{t.contactTopic[topic.id]}</strong>
              <span className="contact-route__links">{links.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{host(url)}<External /></a>)}</span>
            </li>
          );
        })}
        {praetors.map((item) => (
          <li key={item.id}>
            <strong>{t.contactPretura(item.label)}</strong>
            <span>{item.contact.address}</span>
            <span className="contact-route__links">
              <a href={`tel:${item.contact.phone}`}>{item.contact.phone_label}</a>
              <a href={item.website} target="_blank" rel="noreferrer">{t.contactWebsite}<External /></a>
              {routing.aboutPetitions && <a href={item.petitions_url} target="_blank" rel="noreferrer">{t.contactPetitions}<External /></a>}
            </span>
          </li>
        ))}
        {routing.topics.length === 0 && praetors.length === 0 && <li>
          <strong>{t.contactPrimaria}</strong>
          <span className="contact-route__links"><a href={PRIMARIA.url} target="_blank" rel="noreferrer">{PRIMARIA.label}<External /></a></span>
        </li>}
      </ul>
    </div>
  );
}

const REASONS = ['incorrect', 'incomplete', 'sources', 'outdated', 'translation'];

// A "no" asks what was wrong, so the report says which answer, which sources and which problem.
function Feedback({ turn, citations }) {
  const { lang, t } = useLang();
  const [rating, setRating] = useState(turn.rating || null);
  const [reasons, setReasons] = useState([]);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(Boolean(turn.rating));
  const [feedbackId, setFeedbackId] = useState(null);
  const entry = (value, extra = {}) => ({
    rating: value, request_id: turn.data.request_id, question: turn.question, status: turn.data.status, language: turn.language || lang,
    sources: citations.map((citation) => ({ document_id: citation.document_id, chunk_id: citation.chunk_id, url: citation.url })),
    ...(turn.messageId ? { message_id: turn.messageId } : {}), ...extra,
  });

  function rate(value) {
    setRating(value);
    // Recorded at once, so a "No" counts even if the person adds no details.
    sendFeedback(entry(value)).then(setFeedbackId).catch(() => {});
    if (value === 'up') setSent(true);
  }
  function submit(event) {
    event.preventDefault();
    if (reasons.length || comment.trim()) sendFeedback(entry('down', { reasons, comment: comment.trim(), ...(feedbackId ? { feedback_id: feedbackId } : {}) })).catch(() => {});
    setSent(true);
  }
  const toggle = (reason) => setReasons((current) => (current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason]));

  if (sent) return <p className="feedback feedback--done" role="status">{t.feedbackThanks}</p>;
  return (
    <div className="feedback">
      <span>{t.helpful}</span>
      <button type="button" aria-pressed={rating === 'up'} onClick={() => rate('up')}><ThumbUp />{t.yes}</button>
      <button type="button" aria-pressed={rating === 'down'} onClick={() => rate('down')}><ThumbDown />{t.no}</button>
      {rating === 'down' && <form className="feedback__form" onSubmit={submit}>
        <fieldset className="feedback__reasons">
          <legend>{t.feedbackWhy}</legend>
          {REASONS.map((reason) => (
            <label key={reason} className="feedback__reason">
              <input type="checkbox" checked={reasons.includes(reason)} onChange={() => toggle(reason)} />
              <span>{t.feedbackReasons[reason]}</span>
            </label>
          ))}
        </fieldset>
        <label className="sr-only" htmlFor={`fb-${turn.id}`}>{t.feedbackWhat}</label>
        <input id={`fb-${turn.id}`} value={comment} maxLength={1000} placeholder={t.feedbackWhat} onChange={(event) => setComment(event.target.value)} />
        <button type="submit">{t.feedbackSend}</button>
      </form>}
    </div>
  );
}
