import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth';
import { useLang } from './i18n';
import { useToast } from './Toast';
import Logo from './Logo';
import { Camera, Chat, DocumentIcon, Grid, Help, Home, Moon, Sun } from './Icons';
import { useTheme } from './theme';

export default function Header({ route, onReport, onLanguage }) {
  const { lang, t } = useLang();
  const { user, logout } = useAuth();
  const notify = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const menu = useRef(null);
  const links = [
    ['home', '#/', t.navHome, <Home key="h" />],
    ['assistant', '#/asistent', t.navAssistant, <Chat key="c" />],
    ['issues', '#/probleme', t.navIssues, <Grid key="g" />],
    ['library', '#/documente', t.navLibrary, <DocumentIcon key="d" />],
    ['help', '#/ajutor', t.navHelp, <Help key="q" />],
  ];

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => { if (!menu.current?.contains(event.target)) setMenuOpen(false); };
    const onKey = (event) => { if (event.key === 'Escape') { setMenuOpen(false); menu.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  useEffect(() => setMenuOpen(false), [route]);

  async function signOut() {
    setMenuOpen(false);
    try {
      await logout();
    } catch {
      notify(t.signOutFailed, 'error');
      return;
    }
    notify(t.signedOut);
    window.location.hash = '#/';
  }

  const initials = (user?.full_name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <a className="brand" href="#/" aria-label={t.homeLabel}><Logo /></a>
        <nav className="nav" aria-label={t.navLabel}>
          {links.map(([id, href, label, icon]) => (
            <a key={id} className={`nav__link${route === id ? ' nav__link--active' : ''}`} href={href} aria-current={route === id ? 'page' : undefined}>{icon}<span>{label}</span></a>
          ))}
        </nav>
        <div className="topbar__actions">
          <button className="report-btn" type="button" onClick={onReport} aria-label={t.report}>
            <Camera />
            <span className="report-btn__text">{t.report}</span>
          </button>
          <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? t.themeToLight : t.themeToDark} title={theme === 'dark' ? t.themeToLight : t.themeToDark}>
            {theme === 'dark' ? <Sun /> : <Moon />}
          </button>
          <div className="lang-switch" role="group" aria-label={t.langLabel}>
            {['ro', 'ru'].map((code) => <button key={code} type="button" lang={code} aria-pressed={lang === code} onClick={() => onLanguage(code)}>{code.toUpperCase()}</button>)}
          </div>
          {user ? (
            <div className="account-menu" ref={menu}>
              <button className="account-menu__trigger" type="button" aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen((open) => !open)}>
                <span className="avatar" aria-hidden="true">{initials || '·'}</span>
                <span className="account-menu__name">{user.full_name}</span>
                <span className="account-menu__chevron" aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="account-menu__panel" role="menu">
                  <div className="account-menu__who"><strong>{user.full_name}</strong><span>{user.email}</span><span className="role-chip">{t.roleLabel[user.role]}</span></div>
                  <a role="menuitem" href="#/cont">{t.account}</a>
                  <button role="menuitem" type="button" onClick={signOut}>{t.signOut}</button>
                </div>
              )}
            </div>
          ) : (
            <a className={`signin-link${route === 'login' ? ' is-current' : ''}`} href="#/autentificare">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.6" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              {t.signIn}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
