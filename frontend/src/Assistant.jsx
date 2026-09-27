import { useCallback, useEffect, useRef, useState } from 'react';
import { askQuestion, AskError } from './api';
import { useAuth } from './auth';
import { clearGuestChat, getConversation, readGuestChat, toTurns, writeGuestChat } from './conversations';
import { detectLanguage, useLang } from './i18n';
import { useToast } from './Toast';
import AnswerCard from './AnswerCard';
import ConversationSidebar from './ConversationSidebar';
import SourceViewer from './SourceViewer';
import { DocSearch } from './Icons';
import MicButton from './MicButton';

// Turn ids must stay unique across reloads: a visitor's restored chat keeps its old ids.
let nextId = 1;
const newTurnId = () => `t${Date.now().toString(36)}-${nextId++}`;

// Answers take several seconds; naming the step in progress makes the wait legible.
function Thinking() {
  const { t } = useLang();
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timers = [2200, 5200].map((delay, index) => setTimeout(() => setStage(index + 1), delay));
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <div className="turn__loading" role="status">
      <span className="pulse" aria-hidden="true" />
      <span className="turn__stage" key={stage}>{t.thinkingStages[stage]}</span>
    </div>
  );
}
// Replace the URL without a history entry, then let the app's hash router read it too,
// so the route and the conversation on screen never disagree.
function setUrl(id) {
  const hash = id ? `#/asistent/${id}` : '#/asistent';
  if (window.location.hash === hash) return;
  window.history.replaceState(null, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export default function Assistant({ sectors, conversationParam, pendingQuestion, onPendingConsumed }) {
  const { lang, t } = useLang();
  const { user, ready } = useAuth();
  const notify = useToast();
  const [turns, setTurns] = useState(() => (conversationParam ? [] : readGuestChat()));
  const [conversation, setConversation] = useState(null); // { id, title } once saved
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [selection, setSelection] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [sidebarVersion, setSidebarVersion] = useState(0);
  const threadEnd = useRef(null);
  const input = useRef(null);
  const controllers = useRef(new Map());
  const conversationRef = useRef(null);
  // Bumped whenever the thread on screen changes; answers from an older thread are dropped.
  const thread = useRef(0);
  const busy = turns.some((turn) => turn.state === 'loading');
  conversationRef.current = conversation;

  useEffect(() => () => controllers.current.forEach((controller) => controller.abort()), []);

  // Visitors keep their chat for the tab; signed-in users have it on the server.
  useEffect(() => { if (ready && !user) writeGuestChat(turns); }, [turns, user, ready]);

  const abortPending = useCallback(() => {
    thread.current += 1;
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
  }, []);

  const reset = useCallback(() => {
    abortPending();
    setTurns([]);
    setSelection(null);
    setConversation(null);
    setUrl(null);
  }, [abortPending]);

  // Signing out must not leave the previous person's conversation on screen (shared computers).
  const previousUser = useRef(user);
  useEffect(() => {
    if (previousUser.current && !user) {
      reset();
      clearGuestChat();
    }
    previousUser.current = user;
  }, [user, reset]);

  // Open the conversation named in the URL (sidebar click, account page, back button).
  useEffect(() => {
    if (!ready) return undefined;
    if (!conversationParam) {
      if (conversationRef.current) reset();
      return undefined;
    }
    if (!user || conversationRef.current?.id === conversationParam) return undefined;
    abortPending();
    const controller = new AbortController();
    setLoading(true);
    setSelection(null);
    getConversation(conversationParam, controller.signal)
      .then((data) => {
        setConversation({ id: data.id, title: data.title });
        setTurns(toTurns(data.messages));
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        notify(t.loadFailed, 'error');
        reset();
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [conversationParam, user, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // A question from the home page always starts a new conversation.
  useEffect(() => {
    if (pendingQuestion && ready) {
      reset();
      ask(pendingQuestion, null);
      onPendingConsumed();
    }
  }, [pendingQuestion, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: 'end', behavior: turns.length > 1 ? 'smooth' : 'auto' });
  }, [turns.length, turns.at(-1)?.state]);

  function update(id, patch) {
    setTurns((all) => all.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));
  }

  async function ask(question, conversationId = conversationRef.current?.id ?? null) {
    const text = question.trim();
    if (!text) return;
    const id = newTurnId();
    const origin = thread.current;
    const language = detectLanguage(text, lang);
    setTurns((all) => [...all, { id, question: text, language, state: 'loading' }]);
    setDraft('');
    const controller = new AbortController();
    controllers.current.set(id, controller);
    try {
      const data = await askQuestion(text, language, controller.signal, conversationId);
      if (origin !== thread.current) return;
      update(id, { state: 'done', data, messageId: data.message_id });
      if (data.conversation_id) {
        const isNew = conversationRef.current?.id !== data.conversation_id;
        setConversation({ id: data.conversation_id, title: data.conversation_title });
        if (isNew) setUrl(data.conversation_id);
        setSidebarVersion((value) => value + 1);
      }
      const first = data.citations?.[0];
      if (first && data.status !== 'abstained') setSelection({ turnId: id, chunkId: first.chunk_id, range: null, auto: true });
    } catch (error) {
      if (error.name === 'AbortError' || origin !== thread.current) return;
      update(id, { state: 'error', error: error instanceof AskError ? error.kind : 'generic' });
    } finally {
      controllers.current.delete(id);
    }
  }

  function retry(turn) {
    setTurns((all) => all.filter((item) => item.id !== turn.id));
    ask(turn.question);
  }

  function newConversation() {
    reset();
    setDrawer(false);
    input.current?.focus();
  }

  function submit(event) {
    event.preventDefault();
    if (!busy && !loading) ask(draft);
  }

  const selectedTurn = selection && turns.find((turn) => turn.id === selection.turnId);
  const selectedCitation = selectedTurn?.data?.citations.find((citation) => citation.chunk_id === selection.chunkId);
  const citationIndex = selectedTurn?.data?.citations.indexOf(selectedCitation);
  const draftLanguage = detectLanguage(draft, lang);

  return (
    <div className={`assistant${drawer ? ' has-drawer' : ''}`}>
      <ConversationSidebar
        activeId={conversation?.id}
        version={sidebarVersion}
        open={drawer}
        onClose={() => setDrawer(false)}
        onNew={newConversation}
        onDeleted={(id) => { if (conversation?.id === id) newConversation(); }}
        onRenamed={(item) => { if (conversation?.id === item.id) setConversation({ id: item.id, title: item.title }); }}
      />
      <section className="assistant__main" aria-labelledby="assistant-title">
        <header className="assistant__head">
          <div>
            <button className="history-toggle" type="button" onClick={() => setDrawer(true)} aria-expanded={drawer}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
              {t.history}
            </button>
            <h1 id="assistant-title">{conversation?.title || t.assistantTitle}</h1>
            <p>{conversation ? t.turns(turns.filter((turn) => turn.state === 'done').length) : t.assistantIntro}</p>
          </div>
          {(turns.length > 0 || conversation) && <button className="ghost-action" type="button" onClick={newConversation}>{t.newChat}</button>}
        </header>

        <div className="thread" aria-live="polite" aria-busy={loading}>
          {loading && <div className="thread__loading" aria-hidden="true"><div className="skeleton skeleton--bubble" /><div className="skeleton skeleton--answer" /></div>}
          {!loading && turns.length === 0 && <div className="thread__empty">
            <h2>{t.emptyTitle}</h2>
            <p>{t.emptyBody}</p>
            <ul className="prompt-list">
              {[...t.suggestions, t.crossSuggestion].map((suggestion, index) => (
                <li key={suggestion} style={{ '--i': index }}><button type="button" onClick={() => ask(suggestion)} lang={detectLanguage(suggestion, lang)}>{suggestion}</button></li>
              ))}
            </ul>
          </div>}
          {!loading && turns.map((turn) => (
            <article className="turn" key={turn.id}>
              <p className="turn__question" lang={turn.language}><span className="sr-only">{t.you}: </span>{turn.question}</p>
              {turn.state === 'loading' && <Thinking />}
              {turn.state === 'error' && <div className="turn__error" role="alert">
                <p>{turn.error === 'unavailable' ? t.errorUnavailable : t.errorGeneric}</p>
                <button className="ghost-action" type="button" onClick={() => retry(turn)}>{t.retry}</button>
              </div>}
              {turn.state === 'done' && <AnswerCard
                turn={turn}
                sectors={sectors}
                selectedChunk={selection?.turnId === turn.id ? selection.chunkId : null}
                onSelect={(chunkId, range) => setSelection({ turnId: turn.id, chunkId, range })}
              />}
            </article>
          ))}
          <div ref={threadEnd} />
        </div>

        <form className="composer" onSubmit={submit}>
          <DocSearch className="composer__spark" />
          <label className="sr-only" htmlFor="assistant-question">{t.askLabel}</label>
          <textarea
            id="assistant-question" ref={input} rows={1} value={draft} maxLength={1000}
            placeholder={t.askPlaceholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) submit(event); }}
          />
          <span className="lang-badge" title={t.askAutoTitle}>{t.answerLang[draftLanguage]}</span>
          <MicButton onText={setDraft} />
          <button className="ask-button" type="submit" disabled={busy || loading || !draft.trim()}>{t.askButton}</button>
        </form>
        <p className="assistant__disclaimer">{t.disclaimer}</p>
      </section>

      <SourceViewer
        citation={selectedCitation}
        index={citationIndex}
        range={selection?.range}
        open={Boolean(selectedCitation) && !selection?.auto}
        onClose={() => setSelection((current) => current && { ...current, auto: true })}
        answerLanguage={selectedTurn?.language}
      />
    </div>
  );
}
