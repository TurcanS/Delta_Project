import { useState } from 'react';
import CategoryIcon from './CategoryIcon';
import { Arrow, Close, Pin } from './Icons';

export default function SectorPanel({ sector, onClose, onReport }) {
  const [expanded, setExpanded] = useState(null);
  const [mode, setMode] = useState('services');
  return (
    <section className="sector-panel" id="sectorPanel" aria-labelledby="sector-title">
      <header className="sector-panel__header">
        <span className="sector-panel__marker"><Pin /></span>
        <div><p className="sector-panel__eyebrow">Explorează sectorul</p><h2 className="sector-panel__title" id="sector-title">{sector.label}</h2></div>
        <button className="sector-panel__close" type="button" onClick={onClose} aria-label="Închide detaliile sectorului"><Close /></button>
      </header>
      <p className="sector-panel__description">{sector.description}</p>
      <div className="panel-switch" aria-label="Tipul informațiilor">
        <button type="button" aria-pressed={mode === 'services'} onClick={() => setMode('services')}>Servicii</button>
        <button type="button" aria-pressed={mode === 'contact'} onClick={() => setMode('contact')}>Contacte</button>
      </div>
      <div className="sector-panel__body">
      {mode === 'services' ? <>
      <div className="sector-panel__section-label"><span>Cu ce te putem ajuta?</span><span>{sector.categories.length} domenii</span></div>
      <ul className="category-list">
        {sector.categories.map((category) => {
          const open = expanded === category.icon;
          return (
            <li className={`category-list__item${open ? ' is-expanded' : ''}`} key={category.icon}>
              <button className="category-toggle" type="button" aria-expanded={open} aria-controls={`topic-${category.icon}`} onClick={() => setExpanded(open ? null : category.icon)}>
                <span className="category-list__icon"><CategoryIcon name={category.icon} /></span>
                <span className="category-list__name">{category.name}</span><span className="category-chevron" aria-hidden="true">⌄</span>
              </button>
              {open && <div className="category-detail" id={`topic-${category.icon}`}>
                <p>{category.description}</p>
                <ul>{category.topics.map((topic) => <li key={topic}>{topic}</li>)}</ul>
                <a href={sector.website} target="_blank" rel="noreferrer">Verifică la Pretura {sector.label} <span aria-hidden="true">↗</span></a>
                <span className="category-detail__note">Se deschide site-ul oficial al preturii.</span>
              </div>}
            </li>
          );
        })}
      </ul>
      </> : <div className="sector-contact">
        <p className="sector-contact__intro">Pretura sectorului {sector.label}</p>
        <dl>
          <div><dt>Adresă</dt><dd>{sector.contact.address}, Chișinău</dd></div>
          <div><dt>Telefon</dt><dd><a href={`tel:${sector.contact.phone}`}>{sector.contact.phone_label} ↗</a></dd></div>
          <div><dt>E-mail</dt><dd><a href={`mailto:${sector.contact.email}`}>{sector.contact.email} ↗</a></dd></div>
        </dl>
        <a className="contact-petition" href={sector.petitions_url} target="_blank" rel="noreferrer">{sector.id === 'botanica' ? 'Contacte pe site-ul preturii' : 'Pagina oficială de petiții'} ↗</a>
        <p className="contact-note">Date consultate pe site-ul preturii. Verifică programul înainte de vizită.</p>
      </div>}
      </div>
      <footer className="sector-panel__footer">
        <a className="sector-panel__link" href={sector.website} target="_blank" rel="noreferrer">Pretura sectorului {sector.label}<Arrow /></a>
        <button className="sector-report" type="button" onClick={onReport}>Ai observat o problemă în sector? <span aria-hidden="true">↗</span></button>
      </footer>
    </section>
  );
}
