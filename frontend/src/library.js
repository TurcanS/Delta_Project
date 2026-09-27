import { api } from './api';

export const LIBRARY_KINDS = ['project', 'pdf', 'docx'];

export function searchLibrary({ q = '', kind = '', sector = '', offset = 0, limit = 24, match = '', sort = '' } = {}, signal) {
  const params = new URLSearchParams(Object.entries({ q, kind, sector, offset: offset || '', limit, match, sort }).filter(([, value]) => value));
  return api(`/api/library?${params}`, { signal });
}

export const getDocument = (id, signal) => api(`/api/library/${id}`, { signal });
export const refreshLibrary = () => api('/api/library/refresh', { method: 'POST', body: {} });

// Sector counts are shown in several places; one request per page load is enough.
let stats = null;
export function libraryStats({ fresh = false } = {}) {
  if (!stats || fresh) stats = api('/api/library/stats').catch((error) => { stats = null; throw error; });
  return stats;
}

// FTS snippets mark matches with \u0002 … \u0003; the UI turns them into <mark>.
export function splitSnippet(snippet) {
  const parts = [];
  (snippet || '').split('\u0002').forEach((piece, index) => {
    if (index === 0) { if (piece) parts.push({ text: piece }); return; }
    const [marked, rest] = piece.split('\u0003');
    parts.push({ text: marked, mark: true });
    if (rest) parts.push({ text: rest });
  });
  return parts;
}

// Words of a query as a regular expression that ignores Romanian diacritics, for the reader.
const FOLD = { a: '[aăâ]', i: '[iî]', s: '[sșş]', t: '[tțţ]', ă: '[aăâ]', â: '[aăâ]', î: '[iî]', ș: '[sșş]', ş: '[sșş]', ț: '[tțţ]', ţ: '[tțţ]' };
export function queryPattern(query) {
  const words = (query || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  // Same stemming as the server: long words match on their stem (grădinița → grădiniței).
  const stems = words.filter((word) => word.length > 1).map((word) => (word.length > 5 ? Array.from(word).slice(0, Math.max(4, Array.from(word).length - 2)).join('') : word));
  const parts = stems.map((word) => Array.from(word).map((ch) => FOLD[ch] || ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(''));
  return parts.length ? new RegExp(`((?:${parts.join('|')})[\\p{L}\\p{N}]*)`, 'giu') : null;
}

export const formatMoney = (value, lang) => new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'ro-RO', { maximumFractionDigits: 0 }).format(value);
export const libraryHost = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
