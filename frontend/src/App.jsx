import { useEffect, useRef, useState } from 'react';
import Header from './Header';
import Features from './Features';
import CityMap from './CityMap';
import SectorPanel from './SectorPanel';
import ServiceSearch from './ServiceSearch';
import ReportDialog from './ReportDialog';
import { Arrow, Pin } from './Icons';

export default function App() {
  const [sectors, setSectors] = useState([]);
  const reportTrigger = useRef(null);
  const [selected, setSelected] = useState('centru');
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const sector = sectors.find((item) => item.id === selected);

  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch('/api/sectors', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Could not load sectors');
        return response.json();
      })
      .then((data) => setSectors(data.sort((a, b) => a.label.localeCompare(b.label, 'ro'))))
      .catch((error) => { if (error.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, [attempt]);

  function selectSector(id) {
    setSelected(id);
    setPanelOpen(true);
  }
  function closePanel() {
    setPanelOpen(false);
    document.querySelector(`.sector-label[data-sector="${selected}"]`)?.focus({ preventScroll: true });
  }
  function openReport() {
    if (sector) {
      reportTrigger.current = document.activeElement;
      setReportOpen(true);
    }
    else document.getElementById('exploreaza')?.scrollIntoView({ block: 'center' });
  }

  function closeReport() {
    setReportOpen(false);
    requestAnimationFrame(() => reportTrigger.current?.focus({ preventScroll: true }));
  }

  return (
    <div className={`portal${highContrast ? ' portal--contrast' : ''}`}>
      <a className="skip-link" href="#main">Mergi la conținut</a>
      <Header onReport={openReport} highContrast={highContrast} onToggleContrast={() => setHighContrast((value) => !value)} />
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__inner">
            <div className="hero__intro">
              <p className="eyebrow hero__eyebrow"><span />CHIȘINĂU, ZI DE ZI</p>
              <h1 className="hero__title" id="hero-title">Informația<br />municipală,<br /><span className="hero__title--accent">mai simplă.</span></h1>
              <p className="hero__subtitle">Servicii, acte și întrebări despre oraș.<br />Alege sectorul tău și găsește drumul către informația de care ai nevoie.</p>
              <a className="hero__action" href="#intreaba">Găsește un serviciu<Arrow /></a>
              <div className="hero__trust"><span className="trust-symbol" aria-hidden="true">✓</span><p>Surse oficiale.<br /><strong>Informații pe înțelesul tău.</strong></p></div>
            </div>
            <div className="explorer" id="exploreaza">
              <div className="explorer-heading"><h2>Orașul tău, sector cu sector</h2><span>05 sectoare</span></div>
              {sector ? <div className={`mapcard${!panelOpen ? ' mapcard--closed' : ''}`}>
                <div className="map-column">
                  <CityMap selected={selected} panelOpen={panelOpen} onSelect={selectSector} />
                  <p className="map-instruction"><span aria-hidden="true">↖</span> Alege un sector pe hartă sau din listă.</p>
                  <div className="sector-picker" aria-label="Alege sectorul">{sectors.map((item) => <button key={item.id} type="button" aria-pressed={selected === item.id && panelOpen} aria-controls="sectorPanel" onClick={() => selectSector(item.id)}>{item.label}</button>)}</div>
                </div>
                {panelOpen ? <SectorPanel key={selected} sector={sector} onClose={closePanel} onReport={openReport} /> : <section className="sector-panel sector-panel--empty" id="sectorPanel"><Pin /><h2>Explorează un sector</h2><p>Alege o zonă de pe hartă pentru servicii, date de contact și surse oficiale.</p><button className="primary-action" type="button" onClick={() => setPanelOpen(true)}>Revino la {sector.label}<Arrow /></button></section>}
                <p className="sr-only" role="status">Sector selectat: {sector.label}</p>
              </div> : <div className="explorer-state" aria-live="polite">
                {error ? <><h3>Informațiile nu au putut fi încărcate.</h3><p>Verifică conexiunea și încearcă din nou.</p><button className="primary-action" onClick={() => setAttempt((value) => value + 1)}>Încearcă din nou</button></> : <><span className="loading-indicator" /><p>Se încarcă sectoarele orașului…</p></>}
              </div>}
            </div>
          </div>
          {sector && <ServiceSearch sector={sector} />}
        </section>
        <Features onReport={openReport} />
        <section className="help-section" id="ajutor" aria-labelledby="help-title">
          <div><p className="eyebrow">BINE DE ȘTIUT</p><h2 id="help-title">Câteva lucruri,<br />înainte să începi.</h2><p>Un ghid pentru a ajunge mai ușor la instituția potrivită.</p></div>
          <div className="help-questions">
            <details><summary>Ce găsesc în fiecare sector?<span aria-hidden="true">+</span></summary><p>Opt domenii de interes, datele de contact ale preturii și legături către site-urile oficiale. Selectează un domeniu pentru detalii sau „Contacte” pentru telefon și adresă.</p></details>
            <details><summary>Cum trimit o sesizare?<span aria-hidden="true">+</span></summary><p>Butonul „Raportează o problemă” te ajută să pregătești și să copiezi textul. Trimiterea se face pe pagina oficială a instituției, conform cerințelor acesteia.</p></details>
            <details><summary>De unde provin informațiile și harta?<span aria-hidden="true">+</span></summary><p>Datele de contact provin de pe site-urile preturilor. Harta folosește limitele sectoarelor din OpenStreetMap. Telecentru este un cartier al sectorului Centru. Verifică informațiile actualizate direct la instituție.</p></details>
          </div>
        </section>
      </main>
      <footer className="footer">
        <a className="brand" href="#"><span className="brand__mark">Portalul </span><span className="brand__city">Cetățeanului</span></a>
        <p>Un punct de pornire pentru întrebările despre oraș.</p>
        <a href="#main">Înapoi sus <span aria-hidden="true">↑</span></a>
      </footer>
      {reportOpen && sector && <ReportDialog sectors={sectors} initialSector={selected} onClose={closeReport} />}
    </div>
  );
}
