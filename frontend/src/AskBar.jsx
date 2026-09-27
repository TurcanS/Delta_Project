import { useState } from 'react';
import { detectLanguage, useLang } from './i18n';
import { DocSearch } from './Icons';
import MicButton from './MicButton';

export default function AskBar({ onAsk }) {
  const { lang, t } = useLang();
  const [query, setQuery] = useState('');
  function submit(event) {
    event.preventDefault();
    if (query.trim()) onAsk(query.trim());
  }
  return (
    <div className="askbar" id="intreaba">
      <form className="askbar__form" onSubmit={submit} role="search">
        <DocSearch className="askbar__spark" />
        <label className="sr-only" htmlFor="question">{t.askLabel}</label>
        <input id="question" className="askbar__input" type="text" value={query} maxLength={1000} onChange={(event) => setQuery(event.target.value)} placeholder={t.askPlaceholder} autoComplete="off" />
        <span className="lang-badge" title={t.askAutoTitle}>{t.answerLang[detectLanguage(query, lang)]}</span>
        <MicButton onText={setQuery} />
        <button className="ask-button" type="submit">{t.askButton}</button>
      </form>
      <div className="askbar__suggestions"><span>{t.trySuggestions}</span>
        {t.suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => onAsk(suggestion)}>{suggestion}</button>)}
      </div>
    </div>
  );
}
