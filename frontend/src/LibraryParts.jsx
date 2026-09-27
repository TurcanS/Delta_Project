// Library pieces shown outside the library page (home strip, sector panel), kept apart so the
// home page does not load the whole library view.
import { useEffect, useState } from 'react';
import { useLang } from './i18n';
import { formatMoney, libraryStats, searchLibrary } from './library';

// Completion as a thin line, the same language as the problems board: solid when finished.
export function Completion({ value }) {
  const { t } = useLang();
  if (value == null) return null;
  return (
    <span className={`completion${value >= 100 ? ' is-done' : ''}`}>
      <span className="completion__line" aria-hidden="true"><span style={{ width: `${Math.min(100, value)}%` }} /></span>
      {value >= 100 ? t.projectDone : t.projectProgress(value)}
    </span>
  );
}

// Home page: the newest project cards, each opening the project's page on proiecte.chisinau.md.
export function RecentProjects({ sectors }) {
  const { lang, t } = useLang();
  const [items, setItems] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    searchLibrary({ kind: 'project', limit: 4 }, controller.signal).then((data) => setItems(data.items)).catch(() => setItems([]));
    return () => controller.abort();
  }, []);
  if (!items?.length) return null;
  return (
    <section className="recent page" aria-labelledby="recent-title">
      <header className="explorer__head">
        <h2 id="recent-title">{t.recentProjects}</h2>
        <a className="text-action" href="#/documente?kind=project">{t.allProjects}</a>
      </header>
      <ul className="recent__list">
        {items.map((item) => (
          <li key={item.id} className="recent__item">
            <a href={item.url} target="_blank" rel="noreferrer">
              <span className="recent__image">{item.image_url && <img src={item.image_url} alt="" loading="lazy" decoding="async" />}</span>
              <span className="recent__meta">{[sectors.find((entry) => entry.id === item.sector)?.label, item.category?.split(' / ').pop()].filter(Boolean).join(', ')}</span>
              <span className="recent__title">{item.title}</span>
              {item.investment && <span className="recent__money">{item.investment}</span>}
              <Completion value={item.progress} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Sector panel: how many published projects the sector has, linking to them.
export function SectorProjects({ sector }) {
  const { lang, t } = useLang();
  const [stats, setStats] = useState(null);
  useEffect(() => { libraryStats().then((data) => setStats(data.sectors?.[sector.id] || null)).catch(() => {}); }, [sector.id]);
  if (!stats?.projects) return null;
  return (
    <a className="sector-projects" href={`#/documente?kind=project&sector=${sector.id}`}>
      {t.sectorProjects(stats.projects, stats.completed, sector.label)}
      {stats.investment_mdl > 0 && <span>{t.sectorInvestment(formatMoney(stats.investment_mdl, lang))}</span>}
    </a>
  );
}
