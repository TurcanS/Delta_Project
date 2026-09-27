import { useEffect, useRef, useState } from 'react';
import { Camera, Close, External, Eye, IssueIcon } from './Icons';
import { useLang } from './i18n';
import { useToast } from './Toast';
import { ISSUE_CATEGORIES, confirmReport, createReport, fetchReports, preparePhoto } from './reports';

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function PhotoField({ photo, onPhoto, error }) {
  const { t } = useLang();
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  async function take(file) {
    if (!file) return;
    if (file.type && !ACCEPT.includes(file.type)) { onPhoto(null, 'unsupported'); return; }
    setReading(true);
    try {
      const blob = await preparePhoto(file);
      onPhoto({ blob, url: URL.createObjectURL(blob) }, null);
    } catch {
      onPhoto(null, 'unreadable');
    } finally {
      setReading(false);
    }
  }
  return (
    <div className={`photo-field${photo ? ' has-photo' : ''}${dragging ? ' is-dragging' : ''}${error ? ' is-invalid' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); take(event.dataTransfer.files[0]); }}>
      <input ref={input} id="report-photo" className="sr-only" type="file" accept="image/*" aria-describedby="photo-hint" onChange={(event) => { take(event.target.files[0]); event.target.value = ''; }} />
      {photo ? <>
        <img src={photo.url} alt="" />
        <div className="photo-field__tools">
          <button type="button" onClick={() => input.current.click()}><Camera />{t.photoReplace}</button>
          <button type="button" aria-label={t.photoRemove} onClick={() => onPhoto(null, null)}><Close /></button>
        </div>
      </> : (
        <label htmlFor="report-photo" className="photo-field__empty">
          <Camera />
          <strong>{reading ? t.photoReading : t.photoPick}</strong>
          <span>{t.photoDrop}</span>
        </label>
      )}
    </div>
  );
}

export default function ReportDialog({ sectors, initialSector, onClose, onPublished }) {
  const { t } = useLang();
  const notify = useToast();
  const dialog = useRef(null);
  const [sectorId, setSectorId] = useState(initialSector);
  const [category, setCategory] = useState('');
  const [photo, setPhoto] = useState(null);
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [similar, setSimilar] = useState([]);
  const [published, setPublished] = useState(null);
  const [copyStatus, setCopyStatus] = useState('');
  const sector = sectors.find((item) => item.id === sectorId);

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  // Before a new report is written, show what neighbours already reported of the same kind here.
  // Suggestions from the previous selection are cleared at once, so a failed refresh never
  // offers reports from another sector or category.
  useEffect(() => {
    setSimilar([]);
    if (!category || !sectorId) return undefined;
    const controller = new AbortController();
    fetchReports({ sector: sectorId, category, status: 'open' }, controller.signal)
      .then((data) => setSimilar(data.items.slice(0, 3)))
      .catch(() => { /* no suggestions: the report can still be published */ });
    return () => controller.abort();
  }, [sectorId, category]);

  async function confirmExisting(report) {
    try {
      await confirmReport(report.id);
      notify(t.confirmed);
      onPublished?.();
      dialog.current.close();
    } catch {
      notify(t.errGeneric, 'error');
    }
  }

  async function publish(event) {
    event.preventDefault();
    const missing = {};
    if (!photo) missing.photo = 'photo';
    if (!category) missing.category = 'required';
    if (title.trim().length < 3) missing.title = 'title';
    if (description.trim().length < 3) missing.description = 'description';
    setErrors(missing);
    if (Object.keys(missing).length) {
      dialog.current.querySelector('.is-invalid, [aria-invalid=true]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    setBusy(true);
    try {
      const report = await createReport({ title: title.trim(), description: description.trim(), address: address.trim(), sector: sectorId, category }, photo.blob);
      setPublished(report);
      notify(t.published);
      onPublished?.(report);
    } catch (error) {
      const photoProblem = error.fields?.photo;
      if (photoProblem) setErrors({ photo: photoProblem === 'required' ? 'photo' : photoProblem });
      else setErrors({ form: error.status === 429 ? 'throttled' : 'generic' });
    } finally {
      setBusy(false);
    }
  }

  async function copyOfficial() {
    const text = `${t.reportTo(sector.label)}\n${t.reportSubject}: ${published.title}\n${published.address ? `${t.address}: ${published.address}\n` : ''}\n${published.description}\n\n${window.location.origin}${published.photo}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(t.reportCopied);
    } catch {
      setCopyStatus(t.reportCopyFail);
    }
  }

  const field = (name) => (errors[name] ? { 'aria-invalid': true, 'aria-describedby': `err-${name}` } : {});
  const errorText = (name, key = errors[name]) => errors[name] && <span className="field-error" id={`err-${name}`}>{t.reportErrors[key] || t.errRequired}</span>;

  return (
    <dialog ref={dialog} className="report-dialog" aria-labelledby="report-title" onClose={() => { if (!dialog.current.open) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) dialog.current.close(); }}>
      <div className="report-dialog__inner">
        <button className="dialog-close" type="button" aria-label={t.closeForm} onClick={() => dialog.current.close()}><Close /></button>
        {published ? (
          <div className="report-success" aria-live="polite">
            <img className="report-success__photo" src={published.photo} alt="" />
            <h2 id="report-title">{t.successTitle}</h2>
            <p className="dialog-intro">{t.successBody}</p>
            <div className="dialog-actions">
              <button className="primary-action" type="button" onClick={copyOfficial}>{t.copyText}</button>
              <a className="text-action" href={sector.petitions_url} target="_blank" rel="noreferrer">{sector.id === 'botanica' ? t.contactPraetor : t.openPetitions}<External /></a>
            </div>
            <p className="dialog-status" role="status">{copyStatus}</p>
            <a className="ghost-action report-success__board" href="#/probleme" onClick={() => dialog.current.close()}>{t.viewOnBoard}</a>
          </div>
        ) : <>
          <h2 id="report-title">{t.photoReportTitle}</h2>
          <p className="dialog-intro">{t.photoReportIntro}</p>
          <form onSubmit={publish} noValidate>
            <div className="report-field">
              <span className="report-field__label" id="photo-label">{t.fieldPhoto}</span>
              <PhotoField photo={photo} error={errors.photo} onPhoto={(value, problem) => { setPhoto(value); setErrors((current) => ({ ...current, photo: problem || undefined })); }} />
              {errors.photo ? errorText('photo') : <span className="field-hint" id="photo-hint">{t.photoHint}</span>}
            </div>
            <fieldset className={`report-field category-picker${errors.category ? ' is-invalid' : ''}`}>
              <legend className="report-field__label">{t.fieldCategory}</legend>
              <div className="category-picker__grid">
                {ISSUE_CATEGORIES.map((value) => (
                  <label key={value} className="category-chip">
                    <input type="radio" name="category" value={value} checked={category === value} onChange={() => { setCategory(value); setErrors((current) => ({ ...current, category: undefined })); }} />
                    <IssueIcon name={value} /><span>{t.issueCategories[value]}</span>
                  </label>
                ))}
              </div>
              {errorText('category', 'required')}
            </fieldset>
            <div className="report-row">
              <label>{t.fieldSector}<select value={sectorId} onChange={(event) => setSectorId(event.target.value)}>{sectors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label>{t.fieldAddress}<input maxLength={160} value={address} onChange={(event) => setAddress(event.target.value)} placeholder={t.addressPlaceholder} autoComplete="street-address" /></label>
            </div>
            {similar.length > 0 && (
              <section className="similar" aria-labelledby="similar-title">
                <h3 id="similar-title">{t.similarTitle(sector.label)}</h3>
                <p>{t.similarBody}</p>
                <ul>
                  {similar.map((report) => (
                    <li key={report.id}>
                      <img src={report.photo} alt="" />
                      <span className="similar__text"><strong>{report.title}</strong><span>{report.address || t.status[report.status]}</span></span>
                      <button type="button" disabled={report.confirmed} onClick={() => confirmExisting(report)} aria-label={t.seenAria(report.confirmations, report.title)}><Eye />{report.confirmed ? t.seenDone : t.seenToo}</button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <label>{t.fieldIssueTitle}<input maxLength={140} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t.issueTitlePlaceholder} {...field('title')} />{errorText('title')}</label>
            <label>{t.fieldIssueBody}<textarea rows={3} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t.issueBodyPlaceholder} {...field('description')} />{errorText('description')}</label>
            {errors.form && <p className="form-alert" role="alert">{t.reportErrors[errors.form]}</p>}
            <div className="dialog-actions">
              <button className="solid-action" type="submit" disabled={busy}>{busy ? <><span className="spinner" />{t.publishing}</> : t.publish}</button>
            </div>
          </form>
        </>}
      </div>
    </dialog>
  );
}
