import { useEffect, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { deleteConversation, exportUrl, listAllConversations } from './conversations';
import { useLang } from './i18n';
import { useToast } from './Toast';

export const formatDate = (iso, lang, withTime = false) => (iso ? new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'ro-RO', {
  day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
}).format(new Date(iso)) : '');

const initialsOf = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

export default function Account({ onLanguage }) {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const [tab, setTab] = useState('conversations');
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    listAllConversations(controller.signal).then(setItems).catch((error) => { if (error.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, []);

  const tabs = [['conversations', t.tabConversations, items?.length], ['settings', t.tabSettings], ['privacy', t.tabPrivacy]];
  const questions = items?.reduce((sum, item) => sum + item.turns, 0) ?? 0;
  const last = items?.reduce((latest, item) => (item.updated_at > latest ? item.updated_at : latest), '');

  return (
    <section className="account page" aria-labelledby="account-title">
      <header className="account__head">
        <span className="avatar avatar--lg" aria-hidden="true">{initialsOf(user.full_name)}</span>
        <div className="account__who">
          <h1 id="account-title">{user.full_name}</h1>
          <p className="account__meta"><span className="role-chip">{t.roleLabel[user.role]}</span><span>{user.email}</span><span>{t.memberSince}: {formatDate(user.created_at, lang)}</span></p>
        </div>
        <p className="account__summary" aria-live="polite">{items ? t.accountSummary(items.length, questions, last ? formatDate(last, lang) : '') : ''}</p>
      </header>

      <div className="tabs" role="tablist" aria-label={t.accountTitle} style={{ '--tab-index': tabs.findIndex(([id]) => id === tab), '--tab-count': tabs.length }}>
        {tabs.map(([id, label, count]) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} onClick={() => setTab(id)}>
            {label}{count != null && <span className="tabs__count">{count}</span>}
          </button>
        ))}
      </div>

      <div className="tab-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} key={tab}>
        {tab === 'conversations' && (failed ? <p className="form-alert">{t.errGeneric}</p> : <ConversationTable items={items} setItems={setItems} />)}
        {tab === 'settings' && <Settings onLanguage={onLanguage} />}
        {tab === 'privacy' && <Privacy count={items?.length ?? 0} onCleared={() => setItems([])} />}
      </div>
    </section>
  );
}

function ConversationTable({ items, setItems }) {
  const { lang, t } = useLang();
  const notify = useToast();
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState(null);

  if (!items) return <div className="skeleton-list" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="skeleton skeleton--card" style={{ '--i': i }} />)}</div>;
  if (!items.length) {
    return <div className="empty"><p className="empty__title">{t.noConversations}</p><p>{t.emptyBody}</p><a className="primary-action" href="#/asistent">{t.featureAssistantCta}</a></div>;
  }
  const needle = query.trim().toLowerCase();
  const visible = needle ? items.filter((item) => item.title.toLowerCase().includes(needle)) : items;

  async function remove(item) {
    setConfirming(null);
    try {
      await deleteConversation(item.id);
      setItems((all) => all.filter((row) => row.id !== item.id));
      notify(t.conversationDeleted);
    } catch { notify(t.errGeneric, 'error'); }
  }

  return (
    <div className="conv-table">
      <label className="conv-search conv-search--wide">
        <span className="sr-only">{t.searchConversations}</span>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" /><path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchConversations} />
      </label>
      {visible.length === 0 && <p className="conv-list__empty">{t.noMatches}</p>}
      <ul className="conv-cards">
        {visible.map((item, index) => (
          <li key={item.id} className="conv-card" style={{ '--i': Math.min(index, 8) }}>
            <a className="conv-card__main" href={`#/asistent/${item.id}`}>
              <span className="conv-card__title">{item.title}</span>
              <span className="conv-card__meta">
                <span className={`status-tag status-tag--${item.last_status || 'none'}`}>{t.questionStatus[item.last_status] || ''}</span>
                {t.turns(item.turns)}, {formatDate(item.updated_at, lang, true)}
              </span>
            </a>
            {confirming === item.id ? (
              <div className="conv-card__actions conv-card__actions--confirm">
                <span>{t.confirmDelete}</span>
                <button className="danger-button" type="button" onClick={() => remove(item)} autoFocus>{t.remove}</button>
                <button className="ghost-action" type="button" onClick={() => setConfirming(null)}>{t.cancel}</button>
              </div>
            ) : (
              <div className="conv-card__actions">
                <a className="ghost-action" href={exportUrl(item.id, lang)} download>{t.exportMd}</a>
                <button className="ghost-action ghost-action--danger" type="button" onClick={() => setConfirming(item.id)}>{t.remove}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Settings({ onLanguage }) {
  const { t } = useLang();
  const { user, setUser } = useAuth();
  const notify = useToast();
  const [profile, setProfile] = useState({ full_name: user.full_name, preferred_language: user.preferred_language });
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');
  const dirty = profile.full_name !== user.full_name || profile.preferred_language !== user.preferred_language;

  async function saveProfile(event) {
    event.preventDefault();
    setBusy('profile');
    try {
      const data = await api('/api/account', { method: 'PATCH', body: profile });
      setUser(data.user);
      onLanguage(data.user.preferred_language);
      notify(data.user.preferred_language === 'ru' ? 'Изменения сохранены.' : 'Modificările au fost salvate.');
    } catch (error) {
      setErrors(error.fields || {});
    } finally { setBusy(''); }
  }

  async function savePassword(event) {
    event.preventDefault();
    setBusy('password');
    try {
      await api('/api/account/password', { method: 'POST', body: passwords });
      setPasswords({ current_password: '', new_password: '' });
      setErrors({});
      notify(t.passwordChanged);
    } catch (error) {
      setErrors(error.fields || { new_password: 'generic' });
    } finally { setBusy(''); }
  }

  const errorText = (code) => ({ wrong: t.errWrongPassword, too_short: t.errShort, required: t.errRequired }[code] || t.errGeneric);

  return (
    <div className="settings">
      <form className="settings__card" onSubmit={saveProfile}>
        <h2>{t.profile}</h2>
        <div className={`field${errors.full_name ? ' field--error' : ''}`}>
          <label htmlFor="set-name">{t.fieldName}</label>
          <input id="set-name" value={profile.full_name} maxLength={120} autoComplete="name" onChange={(event) => { setProfile({ ...profile, full_name: event.target.value }); setErrors({}); }} />
          {errors.full_name && <p className="field__note">{errorText(errors.full_name)}</p>}
        </div>
        <div className="field">
          <label htmlFor="set-email">{t.fieldEmail}</label>
          <input id="set-email" value={user.email} readOnly />
        </div>
        <fieldset className="field">
          <legend>{t.preferredLanguage}</legend>
          <div className="radio-row">
            {[['ro', 'Română'], ['ru', 'Русский']].map(([code, label]) => (
              <label key={code} className="radio"><input type="radio" name="pref-lang" value={code} checked={profile.preferred_language === code} onChange={() => setProfile({ ...profile, preferred_language: code })} /><span lang={code}>{label}</span></label>
            ))}
          </div>
        </fieldset>
        <button className="primary-action" type="submit" disabled={!dirty || busy === 'profile'}>{t.save}</button>
      </form>
      <form className="settings__card" onSubmit={savePassword}>
        <h2>{t.changePassword}</h2>
        {[['current_password', t.currentPassword, 'current-password'], ['new_password', t.newPassword, 'new-password']].map(([key, label, auto]) => (
          <div key={key} className={`field${errors[key] ? ' field--error' : ''}`}>
            <label htmlFor={`set-${key}`}>{label}</label>
            <input id={`set-${key}`} type="password" autoComplete={auto} value={passwords[key]} onChange={(event) => { setPasswords({ ...passwords, [key]: event.target.value }); setErrors({}); }} />
            <p className="field__note">{errors[key] ? errorText(errors[key]) : key === 'new_password' ? t.fieldPasswordHint : ''}</p>
          </div>
        ))}
        <button className="primary-action" type="submit" disabled={busy === 'password' || !passwords.current_password || !passwords.new_password}>{t.changePassword}</button>
      </form>
    </div>
  );
}

function Privacy({ count, onCleared }) {
  const { t } = useLang();
  const { setUser } = useAuth();
  const notify = useToast();
  const [armed, setArmed] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function clearAll() {
    if (!armed) { setArmed(true); return; }
    setBusy('clear');
    try {
      const data = await api('/api/conversations', { method: 'DELETE', body: { confirm: true } });
      onCleared();
      notify(t.deletedAll(data.deleted));
      setArmed(false);
    } catch { notify(t.errGeneric, 'error'); } finally { setBusy(''); }
  }

  async function deleteAccount(event) {
    event.preventDefault();
    setBusy('account');
    try {
      await api('/api/account', { method: 'DELETE', body: { password } });
      setUser(null);
      notify(t.accountDeleted);
      window.location.hash = '#/';
    } catch (err) {
      setError(err.fields?.password === 'wrong' ? t.errWrongPassword : t.errGeneric);
    } finally { setBusy(''); }
  }

  return (
    <div className="privacy">
      <section className="settings__card">
        <h2>{t.privacyTitle}</h2>
        <p className="privacy__text">{t.privacyBody}</p>
      </section>
      <section className="settings__card settings__card--danger">
        <h2>{t.deleteAllTitle}</h2>
        <p className="privacy__text">{t.deleteAllBody}</p>
        <button className={`danger-button${armed ? ' is-armed' : ''}`} type="button" onClick={clearAll} disabled={!count || busy === 'clear'} onBlur={() => setArmed(false)}>
          {armed ? t.confirmAgain : t.deleteAll}
        </button>
      </section>
      <form className="settings__card settings__card--danger" onSubmit={deleteAccount}>
        <h2>{t.deleteAccountTitle}</h2>
        <p className="privacy__text">{t.deleteAccountBody}</p>
        <div className={`field${error ? ' field--error' : ''}`}>
          <label htmlFor="del-password">{t.fieldPassword}</label>
          <input id="del-password" type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} />
          {error && <p className="field__note">{error}</p>}
        </div>
        <button className="danger-button" type="submit" disabled={!password || busy === 'account'}>{t.deleteAccount}</button>
      </form>
    </div>
  );
}
