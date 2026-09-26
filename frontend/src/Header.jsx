export default function Header({ onReport, highContrast, onToggleContrast }) {
  return (
<header className="topbar">
  <div className="topbar__inner">
    <a className="brand" href="/">
      <span className="brand__mark">Portalul </span><span className="brand__city">Cetățeanului</span>
    </a>

    <nav className="nav" aria-label="Navigație principală">
      <a className="nav__link nav__link--active" href="#">
        <svg className="nav__icon" viewBox="0 0 24 24" fill="none"><path d="M4 11.5L12 4l8 7.5M6 10v9h5v-5h2v5h5v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Acasă
      </a>
      <a className="nav__link" href="#intreaba">
        <svg className="nav__icon" viewBox="0 0 24 24" fill="none"><path d="M4 6h16v10H8l-4 4V6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>
        Servicii
      </a>
      <a className="nav__link" href="#ajutor">
        <svg className="nav__icon" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M9.5 9.3a2.5 2.5 0 0 1 4.9.7c0 1.6-2.2 1.6-2.4 3.3M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        Ajutor
      </a>
    </nav>

    <div className="topbar__actions">
      <button className="report-btn" aria-label="Raportează o problemă" type="button" onClick={onReport}>
        <span className="report-btn__dot"></span>
        <svg viewBox="0 0 24 24" fill="none"><path d="M6 3v18M6 4h11l-2.5 4L17 12H6" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>
        <span className="report-btn__text">Raportează o problemă</span>
      </button>
      <button className="icon-btn" type="button" aria-label="Contrast sporit" title="Activează sau dezactivează contrastul sporit" aria-pressed={highContrast} onClick={onToggleContrast}>
        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="8.3" r="1.4" fill="currentColor"/><path d="M7 11.2c3.4 1 6.6 1 10 0M12 12v6.5M9.3 19.5L12 15l2.7 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
      </button>
      <span className="language-label" lang="ro" title="Limba română">RO</span>
    </div>
  </div>
</header>
  );
}
