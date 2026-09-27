import { useEffect, useState } from 'react';
import IssueCard from './IssueCard';
import IssueDetail from './IssueDetail';
import { Camera, IssueIcon } from './Icons';
import { useLang } from './i18n';
import { useToast } from './Toast';
import { ISSUE_CATEGORIES, ISSUE_STATUSES, confirmReport, fetchReports } from './reports';

export default function Issues({ sectors, version, onReport }) {
  const { t } = useLang();
  const notify = useToast();
  const [status, setStatus] = useState('');
  const [sector, setSector] = useState('');
  const [category, setCategory] = useState('');
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [more, setMore] = useState('idle'); // idle | loading | failed
  const [open, setOpen] = useState(null);
  const labelOf = (id) => sectors.find((item) => item.id === id)?.label || '';

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    setMore('idle');
    fetchReports({ status, sector, category }, controller.signal)
      .then(setData)
      .catch((error) => { if (error.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, [status, sector, category, version, attempt, refresh]);

  const replace = (report) => {
    setData((current) => current && { ...current, items: current.items.map((item) => (item.id === report.id ? report : item)) });
    setOpen((current) => (current?.id === report.id ? report : current));
  };

  // A status change moves the report between tabs: reload counts and the filtered list,
  // while the report stays open with its new state.
  function updated(report) {
    replace(report);
    setRefresh((value) => value + 1);
  }

  async function loadMore() {
    setMore('loading');
    try {
      const page = await fetchReports({ status, sector, category, offset: data.items.length });
      setData((current) => {
        const seen = new Set(current.items.map((item) => item.id));
        return { ...page, items: [...current.items, ...page.items.filter((item) => !seen.has(item.id))] };
      });
      setMore('idle');
    } catch {
      setMore('failed');
    }
  }

  async function confirm(report) {
    replace({ ...report, confirmed: true, confirmations: report.confirmations + 1 });
    try {
      const result = await confirmReport(report.id);
      replace({ ...report, ...result });
      notify(t.confirmed);
    } catch {
      replace(report);
      notify(t.errGeneric, 'error');
    }
  }

  const counts = data?.counts || { reported: 0, in_progress: 0, solved: 0 };
  const total = counts.reported + counts.in_progress + counts.solved;

  return (
    <div className="issues page">
      <header className="issues__head">
        <div>
          <h1 className="issues__title">{t.issuesTitle[0]} {t.issuesTitle[1]}</h1>
          <p className="issues__intro">{t.issuesIntro}</p>
        </div>
        <button className="solid-action" type="button" onClick={() => onReport(sector || undefined)}><Camera />{t.report}</button>
      </header>

      <div className="issues__filters">
        {/* The filter reads as a sentence about the board; each count is a switch. */}
        <p className="tally" role="group" aria-label={t.issuesStatusFilter}>
          <button type="button" aria-pressed={status === ''} onClick={() => setStatus('')}>{t.tally.all(total)}</button>:{' '}
          {ISSUE_STATUSES.map((value, index) => (
            <span key={value}>
              {index === ISSUE_STATUSES.length - 1 ? ` ${t.tally.and} ` : index > 0 ? ', ' : ''}
              <button type="button" className={`tally__${value}`} aria-pressed={status === value} onClick={() => setStatus(status === value ? '' : value)}>{t.tally[value](counts[value])}</button>
            </span>
          ))}.
        </p>
        <div className="issues__selects">
          <label><span className="sr-only">{t.sectorFilter}</span>
            <select value={sector} onChange={(event) => setSector(event.target.value)}>
              <option value="">{t.allCity}</option>
              {sectors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label><span className="sr-only">{t.categoryFilter}</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">{t.allCategories}</option>
              {ISSUE_CATEGORIES.map((value) => <option key={value} value={value}>{t.issueCategories[value]}</option>)}
            </select>
          </label>
        </div>
      </div>

      {failed ? (
        <div className="issues__state"><h2>{t.issuesLoadFailed}</h2><p>{t.loadFailedBody}</p><button className="primary-action" type="button" onClick={() => setAttempt((value) => value + 1)}>{t.retry}</button></div>
      ) : !data ? (
        <ul className="issue-grid" aria-busy="true" aria-label={t.issuesLoading}>{Array.from({ length: 8 }, (_, index) => <li key={index} className="issue-card issue-card--skeleton" />)}</ul>
      ) : data.items.length === 0 ? (
        <div className="issues__state"><IssueIcon name={category || 'other'} /><h2>{t.issuesEmpty}</h2><p>{t.issuesEmptyBody}</p><button className="primary-action" type="button" onClick={() => onReport(sector || undefined)}>{t.report}</button></div>
      ) : (
        <ul className="issue-grid">
          {data.items.map((report) => <li key={report.id}><IssueCard report={report} sectorLabel={labelOf(report.sector)} onOpen={setOpen} onConfirm={confirm} /></li>)}
        </ul>
      )}
      {data?.has_more && !failed && (
        <div className="issues__more">
          <button className="ghost-action" type="button" onClick={loadMore} disabled={more === 'loading'}>{more === 'loading' ? t.issuesLoading : t.issuesMore}</button>
          {more === 'failed' && <p role="alert">{t.issuesLoadFailed}</p>}
        </div>
      )}

      {open && <IssueDetail key={open.id} report={open} sectorLabel={labelOf(open.sector)} onClose={() => setOpen(null)} onConfirm={confirm} onUpdated={updated} />}
    </div>
  );
}
