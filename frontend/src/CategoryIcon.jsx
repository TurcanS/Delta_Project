const icons = {
  transport: (<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="6" width="16" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.7"/><path d="M4 12h16M8 20v-2M16 20v-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="8" cy="16.3" r="0.9" fill="currentColor"/><circle cx="16" cy="16.3" r="0.9" fill="currentColor"/></svg>),
  public: (<svg viewBox="0 0 24 24" fill="none"><path d="M12 4c2 2.5 2 5 0 7-2-2.5-2-4.5 0-7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M12 11v9M8 20h8M6 14c2 1 3 2 3 4M18 14c-2 1-3 2-3 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  admin: (<svg viewBox="0 0 24 24" fill="none"><path d="M4 10l8-5 8 5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M5 10v9M19 10v9M9 19v-6M15 19v-6M3 19h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>),
  education: (<svg viewBox="0 0 24 24" fill="none"><path d="M2 8l10-4 10 4-10 4-10-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M6 10.5V15c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5M21 8v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  health: (<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>),
  culture: (<svg viewBox="0 0 24 24" fill="none"><path d="M4 5h16v10H9l-5 4V5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>),
  social: (<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M15.5 6a3 3 0 0 1 0 5.9M20 20c0-2.8-1.9-5.2-4.5-5.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>),
  housing: (<svg viewBox="0 0 24 24" fill="none"><path d="M4 11l8-7 8 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M6 10v9h12v-9" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M10 19v-5h4v5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>),
};

export default function CategoryIcon({ name }) {
  return icons[name] ?? null;
}
