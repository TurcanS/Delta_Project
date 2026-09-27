import { useLang } from './i18n';
import Logo from './Logo';

export default function Footer({ sectors }) {
  const { t } = useLang();
  return (
    <footer className="footer" data-reveal>
      <div className="footer__inner page">
        <div className="footer__about">
          <a className="brand brand--footer" href="#/" aria-label="Portalul Cetățeanului"><Logo tagline={t.brandTagline} /></a>
          <p>{t.footerAboutText}</p>
        </div>
        <nav aria-labelledby="footer-contacts">
          <h2 id="footer-contacts">{t.footerContacts}</h2>
          <ul>
            <li><a href="https://www.chisinau.md" target="_blank" rel="noreferrer">{t.footerCityHall}</a></li>
            <li><a href="https://proiecte.chisinau.md" target="_blank" rel="noreferrer">{t.footerProjects}</a></li>
          </ul>
        </nav>
        <nav aria-labelledby="footer-praetors">
          <h2 id="footer-praetors">{t.footerPraetors}</h2>
          <ul>{sectors.map((sector) => <li key={sector.id}><a href={sector.website} target="_blank" rel="noreferrer">{t.contactPretura(sector.label)}</a></li>)}</ul>
        </nav>
      </div>
      <div className="footer__base page">
        <p>{t.footerLegal}</p>
        <a href="#main" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t.backTop}</a>
      </div>
    </footer>
  );
}
