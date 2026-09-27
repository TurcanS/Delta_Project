import BeforeAfter from './BeforeAfter';
import { Eye, IssueIcon, Tick } from './Icons';
import { useLang } from './i18n';
import { daysBetween } from './reports';

const STAGES = ['reported', 'in_progress', 'solved'];

// Progress drawn like a lane marking: one dash per stage, painted as the report moves on.
export function ProgressTape({ status }) {
  const reached = STAGES.indexOf(status);
  return (
    <span className={`progress-tape progress-tape--${status}`} aria-hidden="true">
      {STAGES.map((stage, index) => <span key={stage} className={index <= reached ? 'is-painted' : ''} />)}
    </span>
  );
}

export function SeenButton({ report, onConfirm, compact = false }) {
  const { t } = useLang();
  return (
    <button className={`seen-button${report.confirmed ? ' is-confirmed' : ''}${compact ? ' seen-button--compact' : ''}`} type="button"
      aria-pressed={report.confirmed} disabled={report.confirmed || report.status === 'solved'}
      aria-label={t.seenAria(report.confirmations, report.title)} onClick={() => onConfirm(report)}>
      {report.confirmed ? <Tick /> : <Eye />}
      <span className="seen-button__count">{report.confirmations}</span>
      <span className="seen-button__label">{report.confirmed ? t.seenDone : t.seenToo}</span>
    </button>
  );
}

// Status and age read as one phrase: "În lucru, sesizată acum 6 zile".
export function issueAge(report, t) {
  if (report.status === 'solved') return t.fixedIn(daysBetween(report.created_at, report.resolved_at || report.updated_at));
  return t.statusSince[report.status](daysBetween(report.created_at));
}

export default function IssueCard({ report, sectorLabel, onOpen, onConfirm }) {
  const { t } = useLang();
  return (
    <article className={`issue-card issue-card--${report.status}`}>
      <div className="issue-card__media">
        {report.after_photo
          ? <BeforeAfter before={report.photo} after={report.after_photo} alt="" />
          : <img src={report.photo} alt="" loading="lazy" decoding="async" />}
      </div>
      <ProgressTape status={report.status} />
      <div className="issue-card__body">
        <p className="issue-card__kind"><IssueIcon name={report.category} />{t.issueCategories[report.category] || t.issueCategories.other}</p>
        <h3 className="issue-card__title">
          <button type="button" onClick={() => onOpen(report)} aria-label={t.openIssue(report.title)}>{report.title}</button>
        </h3>
        <p className="issue-card__place">{[report.address, sectorLabel].filter(Boolean).join(', ')}</p>
        <div className="issue-card__foot">
          <span className={`issue-card__age issue-card__age--${report.status}`}>{issueAge(report, t)}</span>
          <SeenButton report={report} onConfirm={onConfirm} compact />
        </div>
      </div>
    </article>
  );
}
