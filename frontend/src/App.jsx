import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Header from './Header';
import Features from './Features';
import CityMap from './CityMap';
import SectorPanel from './SectorPanel';
import AskBar from './AskBar';
import { RecentProjects } from './LibraryParts';
import { SwipeLauncher } from './SwipeLauncher';
import Footer from './Footer';
import { useAuth } from './auth';
import { importGuestChat, readGuestChat } from './conversations';
import { LangContext, strings } from './i18n';
import { useToast } from './Toast';
import { useReveal } from './useReveal';
import { localizeSector } from './localize';
import { Pin } from './Icons';

// Each page loads its own code on first visit; the home page ships only what it shows.
const Assistant = lazy(() => import('./Assistant'));
const ReportDialog = lazy(() => import('./ReportDialog'));
const Issues = lazy(() => import('./Issues'));
const Library = lazy(() => import('./Library'));
const SwipeGame = lazy(() => import('./SwipeGame'));
const Login = lazy(() => import('./Login'));
const Account = lazy(() => import('./Account'));
const PageLoading = () => <div className="page page-loading" aria-busy="true"><span className="loading-indicator" /></div>;

const help = {
  ro: {
    title: ['Câteva lucruri,', 'înainte să începeți.'], intro: 'Un ghid pentru a ajunge mai ușor la instituția potrivită.',
    items: [
      ['De unde vin răspunsurile asistentului?', 'Asistentul caută doar în documentele publice ale Primăriei Chișinău: decizii, regulamente și fișele proiectelor municipale. Fiecare răspuns arată documentul și pasajul folosit. Dacă informația nu există în documente, asistentul spune asta în loc să ghicească.'],
      ['Pot întreba în rusă?', 'Da. Scrieți sau dictați întrebarea în română ori în rusă, iar răspunsul vine în aceeași limbă. Documentele citate rămân în limba lor originală.'],
      ['Ce găsesc în fiecare sector?', 'Opt domenii de interes, datele de contact ale preturii și legături către site-urile oficiale. Selectați un domeniu pentru detalii sau „Contacte” pentru telefon și adresă.'],
      ['Cum raportez o problemă din oraș?', 'Butonul „Raportează o problemă” vă permite să adăugați o fotografie, să numiți problema și să indicați locul. Sesizarea apare pe panoul public „Probleme”, unde vecinii o pot confirma și o puteți urmări până e rezolvată. Pentru ca pretura să intervină, trimiteți-o și pe pagina oficială: textul vă este pregătit.'],
    ],
  },
  ru: {
    title: ['Несколько слов,', 'прежде чем начать.'], intro: 'Подсказки, как быстрее найти нужное учреждение.',
    items: [
      ['Откуда берутся ответы ассистента?', 'Ассистент ищет только в публичных документах Примэрии Кишинэу: решениях, положениях и карточках муниципальных проектов. Каждый ответ показывает документ и использованный фрагмент. Если информации в документах нет, ассистент так и скажет, а не будет угадывать.'],
      ['Можно спрашивать на русском?', 'Да. Пишите или диктуйте вопрос на румынском или русском, ответ придёт на том же языке. Цитируемые документы остаются на языке оригинала.'],
      ['Что есть по каждому сектору?', 'Восемь тематических разделов, контакты претуры и ссылки на официальные сайты. Выберите раздел для подробностей или «Контакты» для телефона и адреса.'],
      ['Как сообщить о проблеме в городе?', 'Кнопка «Сообщить о проблеме» позволяет добавить фотографию, назвать проблему и указать место. Обращение появится на открытой доске «Проблемы», где соседи могут его подтвердить, а вы — следить за ним до решения. Чтобы претура приняла меры, отправьте его и на официальной странице: текст подготовлен.'],
    ],
  },
};

const readRoute = () => {
  const hash = window.location.hash;
  const conversation = hash.match(/^#\/asistent\/(\d+)/);
  if (hash.startsWith('#/asistent')) return { name: 'assistant', id: conversation ? Number(conversation[1]) : null };
  if (hash.startsWith('#/ajutor')) return { name: 'help' };
  if (hash.startsWith('#/probleme')) return { name: 'issues' };
  if (hash.startsWith('#/documente')) return { name: 'library', search: hash.split('?')[1] || '' };
  if (hash.startsWith('#/autentificare')) return { name: 'login' };
  if (hash.startsWith('#/cont')) return { name: 'account' };
  return { name: 'home' };
};
const storedLang = () => { try { return localStorage.getItem('lang') === 'ru' ? 'ru' : 'ro'; } catch { return 'ro'; } };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function App() {
  const { user, ready } = useAuth();
  const notify = useToast();
  const [rawSectors, setSectors] = useState([]);
  const reportTrigger = useRef(null);
  const [selected, setSelected] = useState('centru');
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSector, setReportSector] = useState('centru');
  const [reportsVersion, setReportsVersion] = useState(0);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const [route, setRoute] = useState(readRoute);
  const [lang, setLang] = useState(storedLang);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const language = useMemo(() => ({ lang, t: strings[lang] }), [lang]);
  const sectors = useMemo(() => rawSectors.map((item) => localizeSector(item, lang)), [rawSectors, lang]);
  const sector = sectors.find((item) => item.id === selected);
  const t = language.t;
  const page = route.name === 'help' ? 'home' : route.name;
  const previousPage = useRef(page);
  const pointerNavigation = useRef(false);

  useEffect(() => {
    // Commit navigation immediately; a snapshot overlay must not block the next click.
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    // Settle scroll before painting the destination, rather than animating from the old page's offset.
    if (route.name === 'help') document.getElementById('ajutor')?.scrollIntoView({ behavior: 'instant' });
    else if (route.name !== 'assistant' || !route.id) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [route.name]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (previousPage.current === page) return undefined;
    previousPage.current = page;
    const main = document.getElementById('main');
    if (!main) return undefined;
    // Keep page-specific entrance animations from replaying underneath the navigation fade.
    main.dataset.navigation = '';
    if (!pointerNavigation.current || reducedMotion() || !main.animate) return undefined;
    const animation = main.animate([{ opacity: 0.6 }, { opacity: 1 }], {
      duration: 180,
      easing: getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim(),
    });
    // Rapid navigation cancels the old fade; no queued route updates or retained inline styles.
    return () => animation.cancel();
  }, [page]);

  useEffect(() => {
    document.documentElement.lang = lang;
    try { localStorage.setItem('lang', lang); } catch { /* storage unavailable */ }
  }, [lang]);

  // On sign-in: open the portal in the account's language and keep the visitor's chat.
  const signedInAs = useRef(null);
  useEffect(() => {
    if (!ready || !user || signedInAs.current === user.id) {
      if (ready && !user) signedInAs.current = null;
      return;
    }
    const fresh = signedInAs.current === null;
    signedInAs.current = user.id;
    if (fresh) setLang(user.preferred_language);
    importGuestChat().then((conversation) => {
      if (!conversation) return;
      notify(strings[user.preferred_language].savedToAccount);
      window.location.hash = `#/asistent/${conversation.id}`;
    }).catch(() => {});
  }, [user, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pages that need an account send visitors to sign in; signed-in users skip the login page.
  useEffect(() => {
    if (!ready) return;
    if (route.name === 'account' && !user) window.location.replace('#/autentificare');
    // After sign-in a visitor who was mid-conversation returns to it (imported below); others land on the account.
    if (route.name === 'login' && user) window.location.replace(readGuestChat().length ? '#/asistent' : '#/cont');
  }, [route.name, user, ready]);

  useReveal([page, ready]);

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
  function openReport(sectorId) {
    if (!sectors.length) return;
    reportTrigger.current = document.activeElement;
    setReportSector(typeof sectorId === 'string' ? sectorId : selected);
    setReportOpen(true);
  }
  function closeReport() {
    setReportOpen(false);
    requestAnimationFrame(() => reportTrigger.current?.focus({ preventScroll: true }));
  }
  // Routes live in the hash, so "#main" would navigate home; move focus to the content instead.
  function skipToContent(event) {
    event.preventDefault();
    const main = document.getElementById('main');
    main?.focus({ preventScroll: true });
    main?.scrollIntoView();
  }
  function askAssistant(question) {
    setPendingQuestion(question);
    window.location.hash = '#/asistent';
  }

  return (
    <LangContext.Provider value={language}>
      <div className={`portal${page === 'assistant' ? ' portal--assistant' : ''}`} onPointerDownCapture={() => { pointerNavigation.current = true; }} onKeyDownCapture={() => { pointerNavigation.current = false; }}>
        <a className="skip-link" href="#main" onClick={skipToContent}>{t.skip}</a>
        <Header route={route.name} onReport={openReport} onLanguage={setLang} />
        <Suspense fallback={<PageLoading />}>
        {page === 'assistant' && <main id="main" tabIndex={-1} className="page page--wide"><Assistant sectors={sectors} conversationParam={route.id} pendingQuestion={pendingQuestion} onPendingConsumed={() => setPendingQuestion(null)} /></main>}
        {page === 'issues' && <main id="main" tabIndex={-1}><Issues sectors={sectors} version={reportsVersion} onReport={openReport} /></main>}
        {page === 'library' && <main id="main" tabIndex={-1}><Library key={route.search} sectors={sectors} params={new URLSearchParams(route.search)} onAsk={askAssistant} onVote={() => setSwipeOpen(true)} /></main>}
        {page === 'login' && <main id="main" tabIndex={-1}>{ready && !user && <Login />}</main>}
        {page === 'account' && <main id="main" tabIndex={-1}>{ready && user && <Account onLanguage={setLang} />}</main>}
        </Suspense>
        {page === 'home' && <main id="main" tabIndex={-1}>
          <section className="hero page" aria-labelledby="hero-title">
            <div className="hero__lead">
              <h1 className="hero__title" id="hero-title"><span>{t.heroTitle[0]}</span> <span className="hero__rule">{t.heroTitle[1]}</span> <span className="hero__accent">{t.heroTitle[2]}</span></h1>
              <div className="hero__intro">
                <p className="hero__subtitle">{t.heroSubtitle}</p>
              </div>
            </div>
            <AskBar onAsk={askAssistant} />
          </section>
          <section className="explorer page" id="exploreaza" aria-labelledby="explore-title">
            <header className="explorer__head">
              <h2 id="explore-title">{t.exploreHeading}</h2>
              <p>{t.exploreIntro} <span className="explorer-caption">{t.mapCaption}</span></p>
            </header>
            {sector ? <div className={`mapcard${!panelOpen ? ' mapcard--closed' : ''}`}>
              <div className="map-column">
                <CityMap selected={selected} panelOpen={panelOpen} onSelect={selectSector} />
                <div className="sector-picker" aria-label={t.chooseSector}>{sectors.map((item) => <button key={item.id} type="button" aria-pressed={selected === item.id && panelOpen} aria-controls="sectorPanel" onClick={() => selectSector(item.id)}>{item.label}</button>)}</div>
              </div>
              {panelOpen ? <SectorPanel key={selected} sector={sector} onClose={closePanel} onReport={() => openReport(selected)} /> : <section className="sector-panel sector-panel--empty" id="sectorPanel"><Pin /><h2>{t.exploreTitle}</h2><p>{t.exploreBody}</p><button className="primary-action" type="button" onClick={() => setPanelOpen(true)}>{t.backTo(sector.label)}</button></section>}
              <p className="sr-only" role="status">{t.selectedSector(sector.label)}</p>
            </div> : <div className="explorer-state" aria-live="polite">
              {error ? <><h3>{t.loadFailedTitle}</h3><p>{t.loadFailedBody}</p><button className="primary-action" onClick={() => setAttempt((value) => value + 1)}>{t.retry}</button></> : <><span className="loading-indicator" /><p>{t.loadingSectors}</p></>}
            </div>}
          </section>
          <RecentProjects sectors={sectors} />
          <Features onReport={openReport} />
          <section className="help-section page" id="ajutor" aria-labelledby="help-title" data-reveal>
            <div><h2 id="help-title">{help[lang].title[0]}<br />{help[lang].title[1]}</h2><p>{help[lang].intro}</p></div>
            <div className="help-questions">
              {help[lang].items.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}
            </div>
          </section>
        </main>}
        {page !== 'assistant' && <Footer sectors={sectors} />}
        {page !== 'assistant' && !swipeOpen && <SwipeLauncher onOpen={() => setSwipeOpen(true)} />}
        <Suspense fallback={null}>
        {swipeOpen && <SwipeGame sectors={sectors} onClose={() => setSwipeOpen(false)} />}
        {reportOpen && sectors.length > 0 && <ReportDialog sectors={sectors} initialSector={reportSector} onClose={closeReport} onPublished={() => setReportsVersion((value) => value + 1)} />}
        </Suspense>
      </div>
    </LangContext.Provider>
  );
}
