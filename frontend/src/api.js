export class AskError extends Error {
  constructor(kind) { super(kind); this.kind = kind; }
}

export async function askQuestion(question, language, signal, conversationId = null) {
  let response;
  try {
    response = await fetch('/api/ask', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, language, ...(conversationId ? { conversation_id: conversationId } : {}) }),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new AskError('unavailable');
  }
  if (response.status === 503 || response.status === 502) throw new AskError('unavailable');
  if (!response.ok) throw new AskError('generic');
  return response.json();
}

// Resolves to the stored feedback id, so details added later update the same rating.
export function sendFeedback(entry) {
  return fetch('/api/feedback', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry),
  }).then((response) => (response.ok ? response.json() : null)).then((data) => data?.id ?? null);
}

// API offsets count Unicode code points; JS strings index UTF-16 units.
export function segment(text, ranges) {
  const chars = Array.from(text || '');
  const sorted = [...(ranges || [])].filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const parts = [];
  let cursor = 0;
  for (const range of sorted) {
    if (range.start < cursor) continue;
    if (range.start > cursor) parts.push({ text: chars.slice(cursor, range.start).join('') });
    parts.push({ text: chars.slice(range.start, range.end).join(''), range });
    cursor = range.end;
  }
  if (cursor < chars.length) parts.push({ text: chars.slice(cursor).join('') });
  return parts;
}

export class ApiError extends Error {
  constructor(status, body) { super(body?.error || `HTTP ${status}`); this.status = status; this.body = body || {}; }
  get fields() { return this.body.fields || {}; }
}

// JSON helper for the account and admin API; the session cookie travels same-origin.
export async function api(path, { method = 'GET', body, signal } = {}) {
  const response = await fetch(path, {
    method, signal, credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await response.json(); } catch { /* empty body */ }
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}
