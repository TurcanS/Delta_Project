import { ApiError, api } from './api';

export const ISSUE_CATEGORIES = ['pothole', 'lighting', 'waste', 'ads', 'sidewalk', 'vandalism', 'greenery', 'other'];
export const ISSUE_STATUSES = ['reported', 'in_progress', 'solved'];
const MAX_EDGE = 1600;

export function fetchReports(filters = {}, signal) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  return api(`/api/reports${params.size ? `?${params}` : ''}`, { signal });
}

export const confirmReport = (id) => api(`/api/reports/${id}/confirm`, { method: 'POST', body: {} });

async function sendForm(path, form) {
  const response = await fetch(path, { method: 'POST', body: form, credentials: 'same-origin' });
  let data = null;
  try { data = await response.json(); } catch { /* empty body */ }
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

export function createReport(fields, photo) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  form.append('photo', photo, 'photo.jpg');
  return sendForm('/api/reports', form);
}

export function updateReportStatus(id, { status, note, photo }) {
  const form = new FormData();
  form.append('status', status);
  if (note) form.append('note', note);
  if (photo) form.append('photo', photo, 'after.jpg');
  return sendForm(`/api/reports/${id}/status`, form);
}

// Phone photos arrive at 4000px and carry GPS in their EXIF block. Redrawing on a canvas
// shrinks the upload and leaves the metadata behind; the browser applies EXIF rotation first.
export async function preparePhoto(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('encode');
  return blob;
}

const DAY = 86_400_000;
export const daysBetween = (from, to = new Date()) => Math.max(0, Math.floor((new Date(to) - new Date(from)) / DAY));

export const shortDate = (iso, lang) => new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'ro-RO', { day: 'numeric', month: 'short' });
