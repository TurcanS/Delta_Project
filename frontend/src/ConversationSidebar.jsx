import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from './auth';
import { deleteConversation, exportUrl, groupConversations, listConversations, updateConversation } from './conversations';
import { useLang } from './i18n';
import { useToast } from './Toast';
import { Close } from './Icons';

export default function ConversationSidebar({ activeId, version, open, onClose, onNew, onDeleted, onRenamed }) {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const notify = useToast();
  const [items, setItems] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const panel = useRef(null);

  // Debounced server search; also refreshes after every answer (version bump).
  useEffect(() => {
    if (!user) { setItems(null); return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      listConversations(query.trim(), controller.signal)
        .then((page) => { setItems(page.items); setHasMore(page.has_more); })
        .catch((error) => { if (error.name !== 'AbortError') { setItems([]); setHasMore(false); } });
    }, query ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [user, query, version]);

  useEffect(() => {
    if (!menuFor) return undefined;
    const close = (event) => { if (!event.target.closest?.('.conv-item__menu, .conv-item__more')) setMenuFor(null); };
    const onKey = (event) => { if (event.key === 'Escape') setMenuFor(null); };
    const dismiss = () => setMenuFor(null);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', dismiss);
    document.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('scroll', dismiss, true);
    };
  }, [menuFor]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector('button, a, input')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await listConversations(query.trim(), undefined, items.length);
      setItems((all) => [...all, ...page.items.filter((item) => !all.some((row) => row.id === item.id))]);
      setHasMore(page.has_more);
    } catch { notify(t.errGeneric, 'error'); } finally { setLoadingMore(false); }
  }

  async function patch(item, body) {
    setMenuFor(null);
    try {
      const updated = await updateConversation(item.id, body);
      setItems((all) => all.map((row) => (row.id === item.id ? { ...row, ...updated } : row)).sort((a, b) => (b.pinned - a.pinned) || (b.updated_at > a.updated_at ? 1 : -1)));
      onRenamed(updated);
    } catch { notify(t.errGeneric, 'error'); }
  }

  async function remove(item) {
    setConfirming(null);
    setItems((all) => all.filter((row) => row.id !== item.id)); // optimistic; restored on failure
    try {
      await deleteConversation(item.id);
      onDeleted(item.id);
      notify(t.conversationDeleted);
    } catch {
      setItems((all) => [...all, item]);
      notify(t.errGeneric, 'error');
    }
  }

  function saveTitle(event, item) {
    event.preventDefault();
    const title = new FormData(event.currentTarget).get('title').toString().trim();
    setEditing(null);
    if (title && title !== item.title) patch(item, { title });
  }

  const groups = items ? groupConversations(items) : [];

  return (
    <>
      <div className="sidebar-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="conv-sidebar" ref={panel} aria-label={t.history}>
        <div className="conv-sidebar__head">
          <button className="primary-action primary-action--block" type="button" onClick={onNew}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            {t.newConversation}
          </button>
          <button className="conv-sidebar__close" type="button" onClick={onClose} aria-label={t.close}><Close /></button>
        </div>

        {!user ? (
          <div className="guest-card">
            <h2>{t.guestTitle}</h2>
            <p>{t.guestBody}</p>
            <a className="ghost-action" href="#/autentificare">{t.signIn}</a>
          </div>
        ) : (
          <>
            <label className="conv-search">
              <span className="sr-only">{t.searchConversations}</span>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" /><path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchConversations} maxLength={100} />
            </label>
            <nav className="conv-list" aria-label={t.history}>
              {items === null && <div className="skeleton-list" aria-hidden="true">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skeleton--row" style={{ '--i': i }} />)}</div>}
              {items?.length === 0 && <p className="conv-list__empty">{query ? t.noMatches : t.noConversations}</p>}
              {groups.map(([group, list]) => (
                <section key={group} className="conv-group">
                  <h3>{t.groups[group]}</h3>
                  <ul>
                    {list.map((item) => (
                      <li key={item.id} className={`conv-item${item.id === activeId ? ' is-active' : ''}${menuFor === item.id ? ' has-menu' : ''}`}>
                        {editing === item.id ? (
                          <form className="conv-item__edit" onSubmit={(event) => saveTitle(event, item)}>
                            <input name="title" defaultValue={item.title} maxLength={120} autoFocus aria-label={t.rename}
                              onKeyDown={(event) => { if (event.key === 'Escape') setEditing(null); }} onBlur={(event) => event.currentTarget.form?.requestSubmit()} />
                          </form>
                        ) : confirming === item.id ? (
                          <div className="conv-item__confirm" role="alertdialog" aria-label={t.confirmDelete}>
                            <span>{t.confirmDelete}</span>
                            <button type="button" className="danger-link" onClick={() => remove(item)} autoFocus>{t.remove}</button>
                            <button type="button" onClick={() => setConfirming(null)}>{t.cancel}</button>
                          </div>
                        ) : (
                          <>
                            <a className="conv-item__link" href={`#/asistent/${item.id}`} aria-current={item.id === activeId ? 'page' : undefined} onClick={onClose}>
                              {item.pinned && <svg className="conv-item__pin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5ZM12 14v6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>}
                              <span className="conv-item__title">{item.title}</span>
                            </a>
                            <button className="conv-item__more" type="button" aria-label={`${t.options}: ${item.title}`} aria-expanded={menuFor === item.id} onClick={(event) => { setMenuAnchor(event.currentTarget); setMenuFor(menuFor === item.id ? null : item.id); }}>
                              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="18" cy="12" r="1.5" fill="currentColor" /></svg>
                            </button>
                            {menuFor === item.id && (
                              <ItemMenu anchor={menuAnchor}>
                                <button role="menuitem" type="button" onClick={() => { setMenuFor(null); setEditing(item.id); }}>
                                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19h4L19 9l-4-4L5 15v4ZM13 7l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>{t.rename}
                                </button>
                                <button role="menuitem" type="button" onClick={() => patch(item, { pinned: !item.pinned })}>
                                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5ZM12 14v6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg>{item.pinned ? t.unpin : t.pin}
                                </button>
                                <a role="menuitem" href={exportUrl(item.id, lang)} download onClick={() => setMenuFor(null)}>
                                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>{t.exportMd}
                                </a>
                                <span className="conv-menu__divider" role="separator" />
                                <button role="menuitem" type="button" className="danger-link" onClick={() => { setMenuFor(null); setConfirming(item.id); }}>
                                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>{t.remove}
                                </button>
                              </ItemMenu>
                            )}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {hasMore && <button className="ghost-action conv-list__more" type="button" onClick={loadMore} disabled={loadingMore}>{t.issuesMore}</button>}
            </nav>
          </>
        )}
      </aside>
    </>
  );
}

// Rendered in a portal at fixed coordinates so the scrolling list can neither clip nor cover it.
// Opens below the button, or above it when the viewport has no room below.
function ItemMenu({ anchor, children }) {
  const menu = useRef(null);
  const [style, setStyle] = useState({ visibility: 'hidden' });
  useLayoutEffect(() => {
    if (!anchor || !menu.current) return;
    const button = anchor.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = menu.current;
    const below = button.bottom + 6 + height <= window.innerHeight - 8;
    const top = below ? button.bottom + 6 : Math.max(8, button.top - 6 - height);
    const left = Math.min(Math.max(8, button.right - width), window.innerWidth - width - 8);
    setStyle({ top, left, transformOrigin: below ? 'top right' : 'bottom right' });
    menu.current.querySelector('[role=menuitem]')?.focus({ preventScroll: true });
  }, [anchor]);
  return createPortal(<div className="conv-item__menu" role="menu" ref={menu} style={style}>{children}</div>, document.body);
}
