import { useState } from 'react';
import CategoryIcon from './CategoryIcon';
import map from './assets/city-map.json';
import { Close, External } from './Icons';
import { useLang } from './i18n';
import { SectorProjects } from './Library';

// The sector's own outline, drawn from the same pixel grid as the city map.
function SectorShape({ id }) {
  const dots = map.sectors.find((item) => item.id === id)?.dots || [];
  if (!dots.length) return null;
  const xs = dots.map(([x]) => x);
  const ys = dots.map(([, y]) => y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.max(maxX - minX, maxY - minY) + 6;
  // A square box centred on the sector, so wide and tall sectors both sit in the middle.
  const left = (minX + maxX) / 2 - size / 2;
  const top = (minY + maxY) / 2 - size / 2;
  return (
    <svg className="sector-shape" viewBox={`${left} ${top} ${size} ${size}`} aria-hidden="true">
      {dots.map(([x, y]) => <rect key={`${x}-${y}`} x={x - 1.5} y={y - 1.5} width="3" height="3" rx="0.8" />)}
    </svg>
  );
}

export default function SectorPanel({ sector, onClose, onReport }) {
  const [expanded, setExpanded] = useState(null);
  const [mode, setMode] = useState('services');
  const { t } = useLang();
  return (
    <section className="sector-panel" id="sectorPanel" aria-labelledby="sector-title">
      <header className="sector-panel__header">
        <SectorShape id={sector.id} />
        <h2 className="sector-panel__title" id="sector-title">{sector.label}</h2>
        <button className="sector-panel__close" type="button" onClick={onClose} aria-label={t.sectorClose}><Close /></button>
      </header>
      <p className="sector-panel__description">{sector.description}</p>
      <SectorProjects sector={sector} />
      <div className="panel-switch" aria-label={t.infoType}>
        <button type="button" aria-pressed={mode === 'services'} onClick={() => setMode('services')}>{t.tabServices}</button>
        <button type="button" aria-pressed={mode === 'contact'} onClick={() => setMode('contact')}>{t.tabContacts}</button>
      </div>
      <div className="sector-panel__body">
      {mode === 'services' ? <>
      <div className="sector-panel__section-label"><span>{t.helpWith}</span><span>{t.domains(sector.categories.length)}</span></div>
      <ul className="category-list">
        {sector.categories.map((category) => {
          const open = expanded === category.icon;
          return (
            <li className={`category-list__item${open ? ' is-expanded' : ''}`} key={category.icon}>
              <button className="category-toggle" type="button" aria-expanded={open} aria-controls={`topic-${category.icon}`} onClick={() => setExpanded(open ? null : category.icon)}>
                <span className="category-list__icon"><CategoryIcon name={category.icon} /></span>
                <span className="category-list__name">{category.name}</span><span className="category-chevron" aria-hidden="true" />
              </button>
              {open && <div className="category-detail" id={`topic-${category.icon}`}>
                <p>{category.description}</p>
                <ul>{category.topics.map((topic) => <li key={topic}>{topic}</li>)}</ul>
                <a href={sector.website} target="_blank" rel="noreferrer">{t.checkAt(sector.label)} <span aria-hidden="true">↗</span></a>
                <span className="category-detail__note">{t.opensOfficial}</span>
              </div>}
            </li>
          );
        })}
      </ul>
      </> : <div className="sector-contact">
        <p className="sector-contact__intro">{t.contactPretura(sector.label)}</p>
        <dl>
          <div><dt>{t.address}</dt><dd>{sector.contact.address}, Chișinău</dd></div>
          <div><dt>{t.phone}</dt><dd><a href={`tel:${sector.contact.phone}`}>{sector.contact.phone_label} ↗</a></dd></div>
          <div><dt>{t.email}</dt><dd><a href={`mailto:${sector.contact.email}`}>{sector.contact.email} ↗</a></dd></div>
        </dl>
        <a className="contact-petition" href={sector.petitions_url} target="_blank" rel="noreferrer">{sector.id === 'botanica' ? t.contactsOnSite : t.petitionsPage} ↗</a>
        <p className="contact-note">{t.contactNote}</p>
      </div>}
      </div>
      <footer className="sector-panel__footer">
        <a className="sector-panel__link" href={sector.website} target="_blank" rel="noreferrer">{t.contactPretura(sector.label)}<External /></a>
        <button className="sector-report" type="button" onClick={onReport}>{t.sectorProblem} <span aria-hidden="true">↗</span></button>
      </footer>
    </section>
  );
}
