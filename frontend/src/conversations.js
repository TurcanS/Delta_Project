import { api } from './api';

const GUEST_KEY = 'ghid.guest-chat';

// A visitor's chat lives in sessionStorage: it survives navigation and reloads in this tab,
// never touches the server, and is offered to the account on sign-in.
export function readGuestChat() {
  try {
    const turns = JSON.parse(sessionStorage.getItem(GUEST_KEY) || '[]');
    return Array.isArray(turns) ? turns.filter((turn) => turn.state === 'done' && turn.data) : [];
  } catch { return []; }
}
export function writeGuestChat(turns) {
  try {
    const done = turns.filter((turn) => turn.state === 'done' && turn.data).map(({ id, question, language, state, data }) => ({ id, question, language, state, data }));
    if (done.length) sessionStorage.setItem(GUEST_KEY, JSON.stringify(done.slice(-30)));
    else sessionStorage.removeItem(GUEST_KEY);
  } catch { /* storage unavailable: the chat simply is not kept */ }
}
export function clearGuestChat() {
  try { sessionStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
}

export async function importGuestChat() {
  const turns = readGuestChat();
  if (!turns.length) return null;
  const { conversation } = await api('/api/conversations/import', {
    method: 'POST', body: { turns: turns.map(({ question, language, data }) => ({ question, language, data })) },
  });
  clearGuestChat();
  return conversation;
}

// Server messages come as user/assistant pairs; the UI thinks in turns.
export function toTurns(messages) {
  const turns = [];
  for (const message of messages) {
    if (message.role === 'user') turns.push({ id: `m${message.id}`, question: message.content, language: message.language, state: 'pending' });
    else if (turns.length) Object.assign(turns[turns.length - 1], { state: 'done', data: message.data, messageId: message.id, rating: message.rating });
  }
  return turns.filter((turn) => turn.state === 'done');
}

// One page of the history, newest first: { items, has_more }.
export function listConversations(q, signal, offset = 0) {
  const params = new URLSearchParams({ ...(q ? { q } : {}), ...(offset ? { offset } : {}) });
  return api(`/api/conversations${params.size ? `?${params}` : ''}`, { signal });
}
// The account page totals every conversation, so it reads all pages.
export async function listAllConversations(signal) {
  let items = [];
  let page;
  do {
    page = await listConversations('', signal, items.length);
    items = items.concat(page.items);
  } while (page.has_more && page.items.length);
  return items;
}
export const getConversation = (id, signal) => api(`/api/conversations/${id}`, { signal }).then((data) => data.conversation);
export const updateConversation = (id, body) => api(`/api/conversations/${id}`, { method: 'PATCH', body }).then((data) => data.conversation);
export const deleteConversation = (id) => api(`/api/conversations/${id}`, { method: 'DELETE' });
export const exportUrl = (id, lang) => `/api/conversations/${id}/export?lang=${lang}`;

export function groupConversations(items, now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;
  const groups = { pinned: [], today: [], yesterday: [], week: [], older: [] };
  for (const item of items) {
    const time = new Date(item.updated_at).getTime();
    if (item.pinned) groups.pinned.push(item);
    else if (time >= startOfToday) groups.today.push(item);
    else if (time >= startOfToday - day) groups.yesterday.push(item);
    else if (time >= startOfToday - 7 * day) groups.week.push(item);
    else groups.older.push(item);
  }
  return Object.entries(groups).filter(([, list]) => list.length);
}
