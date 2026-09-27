export function Arrow({ className = '' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export function Close() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}
export function Pin() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" /></svg>;
}
const stroke = { stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
export function Spark({ className = '' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z" {...stroke} /><path d="M19 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5Z" {...stroke} strokeWidth="1.3" /></svg>;
}
export function Check() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6l-7-3Z" {...stroke} /><path d="m9 12 2.2 2.2L15.5 10" {...stroke} /></svg>;
}
export function Question() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" {...stroke} /><path d="m16 16 4.5 4.5M8.5 8.5l5 5M13.5 8.5l-5 5" {...stroke} /></svg>;
}
export function Split() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h6v7H5zM13 13h6v7h-6z" {...stroke} /><path d="M8 11v3a3 3 0 0 0 3 3h2M16 13v-3a3 3 0 0 0-3-3h-2" {...stroke} /></svg>;
}
export function ThumbUp() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 11v9H4v-9h3Zm0 0 4-7c1.7 0 2.6 1.2 2.2 2.8L12.6 10H18a2 2 0 0 1 2 2.3l-1.1 6A2 2 0 0 1 17 20H7" {...stroke} /></svg>;
}
export function ThumbDown() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17 13V4h3v9h-3Zm0 0-4 7c-1.7 0-2.6-1.2-2.2-2.8l.6-3.2H6a2 2 0 0 1-2-2.3l1.1-6A2 2 0 0 1 7 4h10" {...stroke} /></svg>;
}
export function External() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" {...stroke} /></svg>;
}
export function DocumentIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Z" {...stroke} /><path d="M14 3v4h4M9 12h6M9 15h6M9 18h4" {...stroke} /></svg>;
}
export function Chat() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h11v8H8l-4 3V5Z" {...stroke} /><path d="M15 9h5v10l-3.5-2.5H10V13" {...stroke} /></svg>;
}
export function Megaphone() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10v4h3l8 4V6L7 10H4ZM18 9.5a3 3 0 0 1 0 5M8 14l1 5h3l-1-4" {...stroke} /></svg>;
}
export function Sun() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4" {...stroke} /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" {...stroke} /></svg>;
}
export function Moon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" {...stroke} /></svg>;
}
export function Camera() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2.2h5.6L16.3 7h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" {...stroke} /><circle cx="12" cy="12.8" r="3.4" {...stroke} /></svg>;
}
export function Eye() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" {...stroke} /><circle cx="12" cy="12" r="3" {...stroke} /></svg>;
}
export function Tick() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" {...stroke} strokeWidth="2" /></svg>;
}
export function Grid() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" {...stroke} /><rect x="13" y="4" width="7" height="7" rx="1.5" {...stroke} /><rect x="4" y="13" width="7" height="7" rx="1.5" {...stroke} /><rect x="13" y="13" width="7" height="7" rx="1.5" {...stroke} /></svg>;
}
// One glyph per kind of street problem, drawn in the same 1.6 stroke as the rest of the set.
const issuePaths = {
  pothole: <><path d="M4 20 8.5 4M20 20 15.5 4M12 4v2.5M12 9v2" {...stroke} /><ellipse cx="12" cy="16" rx="4.2" ry="2.3" {...stroke} /></>,
  lighting: <><path d="M8 21h6M11 21V8a3 3 0 0 1 3-3h3" {...stroke} /><path d="M15.5 5h4l-.8 2.5h-2.4L15.5 5Z" {...stroke} /><path d="M18.5 10.5v1.5M21 9.5l1 1M16 9.5l-1 1" {...stroke} /></>,
  waste: <><path d="M5 7h14M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" {...stroke} /><path d="M10 11v5M14 11v5" {...stroke} /></>,
  ads: <><path d="M5 4h14v10H5zM12 14v7M9 21h6" {...stroke} /><path d="M8 7.5h5M8 10.5h8" {...stroke} /></>,
  sidewalk: <><path d="M4 20 8 4h8l4 16H4Z" {...stroke} /><path d="M6 12h12M11 4l-1 8M13 12l1 8" {...stroke} /></>,
  vandalism: <><path d="M9 3h5v4H9zM8 7h7l1 3v10a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V10l1-3Z" {...stroke} /><path d="M16.5 4.5 19 3M16.5 6.5l3 .5" {...stroke} /></>,
  greenery: <><path d="M12 21v-7" {...stroke} /><path d="M12 14c-4 0-6.5-2.5-6.5-6 0-2.5 2-4.5 6.5-4.5s6.5 2 6.5 4.5c0 3.5-2.5 6-6.5 6Z" {...stroke} /><path d="M9 21h6" {...stroke} /></>,
  other: <><circle cx="12" cy="12" r="8.5" {...stroke} /><path d="M12 7.5v5.5M12 16.2v.3" {...stroke} strokeWidth="2" /></>,
};
export function IssueIcon({ name }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{issuePaths[name] || issuePaths.other}</svg>;
}
export function Home() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 11 12 4.5l8 6.5M6 9.5V20h4.5v-5.5h3V20H18V9.5" {...stroke} /></svg>;
}
export function Help() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" {...stroke} /><path d="M9.8 9.5a2.3 2.3 0 1 1 3.3 2.1c-.7.3-1.1.9-1.1 1.6v.3M12 16.5v.2" {...stroke} /></svg>;
}
// A page with a lens: "looked up in the documents", in place of the usual AI sparkle.
export function DocSearch({ className = '' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 20H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h8l4 4v4" {...stroke} /><path d="M14 3v4h4M8 8h3M8 11.5h5" {...stroke} /><circle cx="16.5" cy="16.5" r="3" {...stroke} /><path d="m18.8 18.8 2.2 2.2" {...stroke} /></svg>;
}
