import { api } from './api';

export const getDeck = (signal) => api('/api/swipe/deck', { signal });
export const sendVote = (documentId, value) => api('/api/swipe/vote', { method: 'POST', body: { document_id: documentId, value } });
export const getResults = (sector, signal) => api(`/api/swipe/results${sector ? `?sector=${sector}` : ''}`, { signal });
export const approval = (likes, dislikes) => (likes + dislikes ? Math.round((100 * likes) / (likes + dislikes)) : null);
