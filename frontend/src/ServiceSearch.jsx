import { useState } from 'react';
import CategoryIcon from './CategoryIcon';
import { Arrow } from './Icons';

const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export default function ServiceSearch({ sector }) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState(null);
  const words = normalize(submitted || '').split(/\s+/).filter(Boolean);
  const results = sector.categories.filter((category) => words.some((word) => normalize(`${category.name} ${category.description} ${category.keywords} ${category.topics.join(' ')}`).includes(word)));
  function search(event) { event.preventDefault(); if (query.trim()) setSubmitted(query.trim()); }
  return (
    <section className="service-search" id="intreaba" aria-labelledby="search-title">
      <div className="section-heading"><div><p className="eyebrow">MAI PUȚIN TIMP CĂUTÂND</p><h2 id="search-title">De ce ai nevoie astăzi?</h2></div><span className="search-scope">Sectorul {sector.label}</span></div>
      <form className="searchbar__inner" onSubmit={search} role="search">
        <svg className="searchbar__spark" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        <input id="question" className="searchbar__input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Un serviciu, un act, o întrebare despre oraș…" aria-label="Caută în ghidul de servicii" required />
        <button className="searchbar__submit" type="submit">Caută<Arrow /></button>
      </form>
      <div className="search-suggestions"><span>Încearcă:</span>{['Grădinițe', 'Transport', 'Iluminat stradal', 'Petiții'].map((term) => <button type="button" key={term} onClick={() => { setQuery(term); setSubmitted(term); }}>{term}<span aria-hidden="true">↗</span></button>)}</div>
      {submitted !== null && <div className="search-results" aria-label="Rezultate căutare">
        <div className="search-results__heading"><p role="status">{results.length ? `${results.length} ${results.length === 1 ? 'domeniu relevant' : 'domenii relevante'}` : 'Niciun domeniu găsit'} pentru „{submitted}” · {sector.label}</p><button type="button" onClick={() => { setSubmitted(null); setQuery(''); }}>Șterge căutarea ×</button></div>
        {results.length ? <div className="search-results__grid">{results.map((category) => <article className="search-result" key={category.icon}><span className="result-icon"><CategoryIcon name={category.icon} /></span><h3>{category.name}</h3><p>{category.description}</p><a href={sector.website} target="_blank" rel="noreferrer">Consultă Pretura {sector.label} ↗</a></article>)}</div> : <p className="empty-search">Încearcă un termen precum „transport”, „școală” sau „petiții”. Pentru alte întrebări, <a href={sector.website} target="_blank" rel="noreferrer">contactează Pretura {sector.label} ↗</a>.</p>}
        <p className="search-note">Ghidul te îndrumă către surse. Condițiile și informațiile actualizate se verifică pe site-ul instituției.</p>
      </div>}
    </section>
  );
}
