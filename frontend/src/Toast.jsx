import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { strings } from './i18n';

const ToastContext = createContext(() => {});
let nextToast = 1;

// Transient confirmations only ("Salvat", "Sesizare trimisă"); errors stay inline next to the field.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((all) => all.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)));
    setTimeout(() => setToasts((all) => all.filter((toast) => toast.id !== id)), 180);
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const notify = useCallback((message, tone = 'ok') => {
    const id = nextToast++;
    setToasts((all) => [...all.slice(-2), { id, message, tone }]);
    timers.current.set(id, setTimeout(() => dismiss(id), 4000));
  }, [dismiss]);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}${toast.leaving ? ' is-leaving' : ''}`}>
            <span className="toast__icon" aria-hidden="true" />
            <p>{toast.message}</p>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label={strings[document.documentElement.lang === 'ru' ? 'ru' : 'ro'].closeToast}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
