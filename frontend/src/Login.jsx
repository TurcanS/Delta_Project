import { useEffect, useRef, useState } from 'react';
import { useAuth } from './auth';
import { useLang } from './i18n';
import { useToast } from './Toast';

const fieldError = (t, code) => ({ required: t.errRequired, invalid: t.errEmail, taken: t.errTaken, too_short: t.errShort }[code] || (code ? t.errGeneric : ''));

export default function Login() {
  const { lang, t } = useLang();
  const { login, register } = useAuth();
  const notify = useToast();
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef(null);
  const card = useRef(null);

  useEffect(() => { first.current?.focus(); }, [mode]);

  const set = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setMessage('');
  };

  // A short horizontal shake says "not accepted" without moving the layout.
  function shake() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    card.current?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 320, easing: 'ease-out' });
  }

  function switchMode(next) {
    setMode(next);
    setErrors({});
    setMessage('');
  }

  async function submit(event) {
    event.preventDefault();
    const local = {};
    if (mode === 'register' && form.full_name.trim().length < 2) local.full_name = 'required';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) local.email = 'invalid';
    if (mode === 'register' ? form.password.length < 8 : !form.password) local.password = mode === 'register' ? 'too_short' : 'required';
    if (Object.keys(local).length) {
      setErrors(local);
      shake();
      return;
    }
    setBusy(true);
    try {
      const user = mode === 'signin'
        ? await login(form.email.trim(), form.password)
        : await register({ ...form, email: form.email.trim(), language: lang });
      notify(t.welcome(user.full_name));
      // App routes onward: back to the imported conversation, or to the account page.
    } catch (error) {
      shake();
      if (error.status === 400) setErrors(error.fields);
      else setMessage({ 401: t.errInvalid, 429: t.errThrottled, 403: t.errDisabled }[error.status] || t.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  const field = (key, label, props, hint) => (
    <div className={`field${errors[key] ? ' field--error' : ''}`}>
      <label htmlFor={`auth-${key}`}>{label}</label>
      <input id={`auth-${key}`} value={form[key]} onChange={set(key)} aria-invalid={Boolean(errors[key])} aria-describedby={`auth-${key}-note`} {...props} />
      <p className="field__note" id={`auth-${key}-note`}>{errors[key] ? fieldError(t, errors[key]) : hint}</p>
    </div>
  );

  return (
    <section className="auth page" aria-labelledby="auth-title">
      <div className="auth__intro">
        <h1 id="auth-title">{t.authTitle}</h1>
        <p>{t.authIntro}</p>
        <div className="auth__aside">
          <h2>{t.authAside[0]}</h2>
          <p>{t.authAside.slice(1).join(' ')}</p>
        </div>
      </div>
      <div className="auth-card" ref={card} data-mode={mode}>
        <div className="segmented" role="tablist" aria-label={t.authTitle}>
          <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => switchMode('signin')}>{t.tabSignIn}</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => switchMode('register')}>{t.tabRegister}</button>
        </div>
        <form className="auth-form" onSubmit={submit} noValidate key={mode}>
          {mode === 'register' && field('full_name', t.fieldName, { ref: first, autoComplete: 'name', maxLength: 120 })}
          {field('email', t.fieldEmail, { ref: mode === 'signin' ? first : undefined, type: 'email', autoComplete: 'email', inputMode: 'email', maxLength: 120 })}
          {field('password', t.fieldPassword, { type: 'password', autoComplete: mode === 'signin' ? 'current-password' : 'new-password', maxLength: 200 }, mode === 'register' ? t.fieldPasswordHint : '')}
          {message && <p className="form-alert" role="alert">{message}</p>}
          <button className="primary-action primary-action--block" type="submit" disabled={busy}>
            {busy ? <><span className="spinner" aria-hidden="true" />{t.working}</> : mode === 'signin' ? t.submitSignIn : t.submitRegister}
          </button>
        </form>
      </div>
    </section>
  );
}
