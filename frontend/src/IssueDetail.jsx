import { useEffect, useRef, useState } from 'react';
import BeforeAfter from './BeforeAfter';
import { ProgressTape, SeenButton, issueAge } from './IssueCard';
import { Close, IssueIcon } from './Icons';
import { useAuth } from './auth';
import { useLang } from './i18n';
import { useToast } from './Toast';
import { ISSUE_STATUSES, preparePhoto, shortDate, updateReportStatus } from './reports';

function StaffUpdate({ report, onUpdated }) {
  const { t } = useLang();
  const notify = useToast();
  const [status, setStatus] = useState(report.status);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const after = photo ? await preparePhoto(photo) : null;
      const updated = await updateReportStatus(report.id, { status, note: note.trim(), photo: after });
      notify(t.staffSaved);
      onUpdated({ ...updated, confirmed: report.confirmed });
    } catch {
      setError(t.errGeneric);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="staff-update" onSubmit={save}>
      <h3>{t.staffTitle}</h3>
      <label>{t.staffStatus}<select value={status} onChange={(event) => setStatus(event.target.value)}>{ISSUE_STATUSES.map((value) => <option key={value} value={value}>{t.status[value]}</option>)}</select></label>
      <label>{t.staffAfter}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files[0] || null)} /></label>
      <label>{t.staffNote}<textarea rows={2} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {error && <p className="form-alert">{error}</p>}
      <button className="primary-action" type="submit" disabled={busy}>{busy ? t.working : t.staffSave}</button>
    </form>
  );
}

export default function IssueDetail({ report, sectorLabel, onClose, onConfirm, onUpdated }) {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  const steps = [
    ['reported', report.created_at],
    ['in_progress', report.status === 'in_progress' ? report.updated_at : null],
    ['solved', report.resolved_at],
  ];
  const reached = ISSUE_STATUSES.indexOf(report.status);
  return (
    <dialog ref={dialog} className="issue-dialog" aria-labelledby="issue-title" onClose={() => { if (!dialog.current.open) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) dialog.current.close(); }}>
      <div className="issue-dialog__media">
        {report.after_photo
          ? <BeforeAfter before={report.photo} after={report.after_photo} interactive alt={report.title} />
          : <img src={report.photo} alt={report.title} />}
      </div>
      <div className="issue-dialog__body">
        <button className="dialog-close" type="button" aria-label={t.close} onClick={() => dialog.current.close()}><Close /></button>
        <div className="issue-dialog__tags"><span className="issue-card__kind"><IssueIcon name={report.category} />{t.issueCategories[report.category] || t.issueCategories.other}</span></div>
        <h2 id="issue-title">{report.title}</h2>
        <p className={`issue-dialog__status issue-card__age--${report.status}`}><ProgressTape status={report.status} />{issueAge(report, t)}</p>
        <p className="issue-dialog__place">{[report.address, sectorLabel].filter(Boolean).join(', ')}</p>
        <p className="issue-dialog__text">{report.description}</p>
        {report.resolution_note && <p className="issue-dialog__note"><strong>{t.resolutionNote}.</strong> {report.resolution_note}</p>}
        <ol className="timeline" aria-label={t.timelineLabel}>
          {steps.map(([status, date], index) => (
            <li key={status} className={index <= reached ? 'is-reached' : ''} aria-current={index === reached ? 'step' : undefined}>
              <span className="timeline__dot" aria-hidden="true" />
              <span className="timeline__label">{t.status[status]}</span>
              {index <= reached && date && <time dateTime={date}>{shortDate(date, lang)}</time>}
            </li>
          ))}
        </ol>
        <div className="issue-dialog__actions">
          <SeenButton report={report} onConfirm={onConfirm} />
        </div>
        {report.photo_credit && <p className="issue-dialog__credit">{t.photoCredit}: {report.photo_credit}</p>}
        {user?.role === 'employee' && <StaffUpdate key={report.updated_at} report={report} onUpdated={onUpdated} />}
      </div>
    </dialog>
  );
}
